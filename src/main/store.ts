import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  AppSettings,
  AppState,
  AppThemeAccent,
  AppThemeMode,
  ClipboardItem,
  FileClipboardItem,
  ImageClipboardItem,
} from '../shared/types.js'

const STORE_VERSION = 1
const themeAccents: readonly AppThemeAccent[] = ['mint', 'blue', 'violet', 'rose', 'amber']
const themeModes: readonly AppThemeMode[] = ['system', 'light', 'dark']

interface PersistedStore {
  version: number
  settings: AppSettings
  items: ClipboardItem[]
}

const defaultSettings: AppSettings = {
  captureEnabled: true,
  launchAtLogin: false,
  maxHistoryItems: 300,
  minTextLength: 1,
  maxTextLength: 20000,
  captureImages: false,
  captureFiles: false,
  maxImageBytes: 5 * 1024 * 1024,
  maxFilePaths: 20,
  globalShortcut: 'Alt+V',
  themeAccent: 'mint',
  themeMode: 'system',
}

/**
 * Small JSON-backed persistence layer for clipboard history and settings.
 *
 * The class serializes writes to avoid corrupting the local store when several
 * clipboard or UI events arrive in quick succession.
 */
export class ClipboardStore {
  private readonly filePath: string
  private state: PersistedStore
  private pendingWrite: Promise<void> = Promise.resolve()

  constructor() {
    this.filePath = join(app.getPath('userData'), 'lightclip-store.json')
    this.state = {
      version: STORE_VERSION,
      settings: { ...defaultSettings },
      items: [],
    }
  }

  /**
   * Loads persisted data from disk, falling back to defaults when the file does not exist.
   */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedStore>
      this.state = {
        version: STORE_VERSION,
        settings: normalizeSettings({ ...defaultSettings, ...parsed.settings }),
        items: Array.isArray(parsed.items) ? parsed.items.map(normalizeClipboardItem).filter(isClipboardItem) : [],
      }
      this.trimOverflow()
    } catch (error) {
      if (!isMissingFileError(error)) {
        console.warn('Failed to load LightClip store, using defaults.', error)
      }
    }
  }

  /**
   * Returns an immutable-ish snapshot sorted for display.
   */
  getState(): AppState {
    return {
      settings: { ...this.state.settings },
      items: this.getSortedItems(),
    }
  }

  /**
   * Adds text to history or refreshes an existing matching item.
   */
  async recordText(text: string): Promise<ClipboardItem | null> {
    const normalized = normalizeClipboardText(text)
    if (!this.canCapture(normalized)) {
      return null
    }

    const now = Date.now()
    const existing = this.state.items.find((item) => item.kind === 'text' && item.text === normalized)
    if (existing) {
      existing.updatedAt = now
      await this.save()
      return { ...existing }
    }

    const item: ClipboardItem = {
      id: createItemId(),
      kind: 'text',
      text: normalized,
      pinned: false,
      copyCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    this.state.items.unshift(item)
    this.trimOverflow()
    await this.save()
    return { ...item }
  }

  /**
   * Adds an image snapshot to history or refreshes an existing matching image.
   */
  async recordImage(dataUrl: string, dimensions: { width: number; height: number }, byteSize: number): Promise<ImageClipboardItem | null> {
    if (!this.canCaptureImage(byteSize)) {
      return null
    }

    const now = Date.now()
    const existing = this.state.items.find((item): item is ImageClipboardItem => item.kind === 'image' && item.dataUrl === dataUrl)
    if (existing) {
      existing.updatedAt = now
      await this.save()
      return { ...existing }
    }

    const item: ImageClipboardItem = {
      id: createItemId(),
      kind: 'image',
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      byteSize,
      pinned: false,
      copyCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    this.state.items.unshift(item)
    this.trimOverflow()
    await this.save()
    return { ...item }
  }

  /**
   * Adds file paths to history or refreshes an existing matching path list.
   */
  async recordFiles(paths: string[]): Promise<FileClipboardItem | null> {
    const normalizedPaths = normalizeFilePaths(paths)
    if (!this.canCaptureFiles(normalizedPaths)) {
      return null
    }

    const now = Date.now()
    const signature = createFileSignature(normalizedPaths)
    const existing = this.state.items.find(
      (item): item is FileClipboardItem => item.kind === 'file' && createFileSignature(item.paths) === signature,
    )
    if (existing) {
      existing.updatedAt = now
      await this.save()
      return { ...existing, paths: [...existing.paths] }
    }

    const item: FileClipboardItem = {
      id: createItemId(),
      kind: 'file',
      paths: normalizedPaths,
      pinned: false,
      copyCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    this.state.items.unshift(item)
    this.trimOverflow()
    await this.save()
    return { ...item, paths: [...item.paths] }
  }

  /**
   * Marks an item as copied from LightClip and returns it.
   */
  async touchCopiedItem(id: string): Promise<ClipboardItem | null> {
    const item = this.state.items.find((entry) => entry.id === id)
    if (!item) {
      return null
    }

    item.copyCount += 1
    item.updatedAt = Date.now()
    await this.save()
    return { ...item }
  }

  /**
   * Deletes a single history item by id.
   */
  async deleteItem(id: string): Promise<boolean> {
    const before = this.state.items.length
    this.state.items = this.state.items.filter((item) => item.id !== id)
    const changed = this.state.items.length !== before
    if (changed) {
      await this.save()
    }
    return changed
  }

  /**
   * Toggles the pinned state of a history item.
   */
  async togglePin(id: string): Promise<ClipboardItem | null> {
    const item = this.state.items.find((entry) => entry.id === id)
    if (!item) {
      return null
    }

    item.pinned = !item.pinned
    item.updatedAt = Date.now()
    await this.save()
    return { ...item }
  }

  /**
   * Removes all non-pinned entries.
   */
  async clearHistory(): Promise<void> {
    this.state.items = this.state.items.filter((item) => item.pinned)
    await this.save()
  }

  /**
   * Persists user settings after validating retention boundaries.
   */
  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    this.state.settings = normalizeSettings({
      ...this.state.settings,
      ...settings,
    })
    this.trimOverflow()
    await this.save()
    return { ...this.state.settings }
  }

  /**
   * Returns a single history item.
   */
  getItem(id: string): ClipboardItem | null {
    const item = this.state.items.find((entry) => entry.id === id)
    return item ? cloneClipboardItem(item) : null
  }

  private canCapture(text: string): boolean {
    const { captureEnabled, minTextLength, maxTextLength } = this.state.settings
    return captureEnabled && text.length >= minTextLength && text.length <= maxTextLength
  }

  private canCaptureImage(byteSize: number): boolean {
    const { captureEnabled, captureImages, maxImageBytes } = this.state.settings
    return captureEnabled && captureImages && byteSize > 0 && byteSize <= maxImageBytes
  }

  private canCaptureFiles(paths: string[]): boolean {
    const { captureEnabled, captureFiles, maxFilePaths } = this.state.settings
    return captureEnabled && captureFiles && paths.length > 0 && paths.length <= maxFilePaths
  }

  private getSortedItems(): ClipboardItem[] {
    return [...this.state.items]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map(cloneClipboardItem)
  }

  private trimOverflow(): void {
    const pinned = this.state.items.filter((item) => item.pinned)
    const regular = this.state.items
      .filter((item) => !item.pinned)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, this.state.settings.maxHistoryItems)

    this.state.items = [...pinned, ...regular]
  }

  private async save(): Promise<void> {
    const payload = JSON.stringify(this.state, null, 2)
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        await writeFile(this.filePath, payload, 'utf8')
      })
    await this.pendingWrite
  }
}

function createItemId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeClipboardText(text: string): string {
  return text.replace(/\u0000/g, '').trim()
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    maxHistoryItems: clampInteger(settings.maxHistoryItems, 20, 3000),
    minTextLength: clampInteger(settings.minTextLength, 1, 2000),
    maxTextLength: clampInteger(settings.maxTextLength, 100, 200000),
    captureImages: Boolean(settings.captureImages),
    captureFiles: Boolean(settings.captureFiles),
    maxImageBytes: clampInteger(settings.maxImageBytes, 128 * 1024, 100 * 1024 * 1024),
    maxFilePaths: clampInteger(settings.maxFilePaths, 1, 200),
    globalShortcut: settings.globalShortcut.trim() || defaultSettings.globalShortcut,
    themeAccent: normalizeThemeAccent(settings.themeAccent),
    themeMode: normalizeThemeMode(settings.themeMode),
  }
}

function normalizeThemeAccent(value: unknown): AppThemeAccent {
  return typeof value === 'string' && themeAccents.includes(value as AppThemeAccent)
    ? (value as AppThemeAccent)
    : defaultSettings.themeAccent
}

function normalizeThemeMode(value: unknown): AppThemeMode {
  return typeof value === 'string' && themeModes.includes(value as AppThemeMode)
    ? (value as AppThemeMode)
    : defaultSettings.themeMode
}

function clampInteger(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : min
  return Math.min(max, Math.max(min, normalized))
}

function isClipboardItem(value: unknown): value is ClipboardItem {
  if (!value || typeof value !== 'object') {
    return false
  }

  const item = value as ClipboardItem
  const hasBaseFields =
    typeof item.id === 'string' &&
    typeof item.pinned === 'boolean' &&
    typeof item.copyCount === 'number' &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'

  if (!hasBaseFields) {
    return false
  }

  if (item.kind === 'text') {
    return typeof item.text === 'string'
  }

  if (item.kind === 'image') {
    return (
      typeof item.dataUrl === 'string' &&
      typeof item.width === 'number' &&
      typeof item.height === 'number' &&
      typeof item.byteSize === 'number'
    )
  }

  if (item.kind === 'file') {
    return Array.isArray(item.paths) && item.paths.every((path) => typeof path === 'string')
  }

  return false
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function normalizeClipboardItem(value: unknown): ClipboardItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Partial<ClipboardItem> & { text?: unknown; kind?: unknown }
  // Existing MVP stores did not have a kind field; keep those text records intact.
  if (!item.kind && typeof item.text === 'string') {
    return { ...(item as Omit<ClipboardItem, 'kind'>), kind: 'text' } as ClipboardItem
  }

  return item as ClipboardItem
}

function normalizeFilePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
}

function createFileSignature(paths: string[]): string {
  return paths.map((path) => path.toLocaleLowerCase()).join('\n')
}

function cloneClipboardItem(item: ClipboardItem): ClipboardItem {
  if (item.kind === 'file') {
    return { ...item, paths: [...item.paths] }
  }

  return { ...item }
}
