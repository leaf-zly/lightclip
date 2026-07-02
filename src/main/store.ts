import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  AppSettings,
  AppState,
  AppThemeAccent,
  AppThemeMode,
  ClipboardItem,
  ClipboardItemKind,
  FileClipboardItem,
  HistoryExportSnapshot,
  ImageClipboardItem,
} from '../shared/types.js'

const STORE_VERSION = 1
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TEMPORARY_PAUSE_MS = DAY_MS
const themeAccents: readonly AppThemeAccent[] = ['mint', 'blue', 'violet', 'rose', 'amber']
const themeModes: readonly AppThemeMode[] = ['system', 'light', 'dark']

interface PersistedStore {
  version: number
  settings: AppSettings
  items: ClipboardItem[]
}

const defaultSettings: AppSettings = {
  captureEnabled: true,
  capturePausedUntil: null,
  launchAtLogin: false,
  maxHistoryItems: 300,
  minTextLength: 1,
  maxTextLength: 20000,
  captureImages: false,
  captureFiles: false,
  maxImageBytes: 5 * 1024 * 1024,
  maxFilePaths: 20,
  retentionDays: 0,
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
      storageBytes: this.getStorageBytes(),
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
   * Removes non-pinned entries of a specific kind and returns the deletion count.
   */
  async clearByKind(kind: ClipboardItemKind): Promise<number> {
    const before = this.state.items.length
    this.state.items = this.state.items.filter((item) => item.pinned || item.kind !== kind)
    const deletedCount = before - this.state.items.length
    if (deletedCount > 0) {
      await this.save()
    }
    return deletedCount
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

  /**
   * Creates a portable export payload containing settings and sorted history.
   */
  createExportSnapshot(): HistoryExportSnapshot {
    return {
      version: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      settings: { ...this.state.settings },
      items: this.getSortedItems(),
    }
  }

  /**
   * Merges imported history items after validation, deduplication, and retention trimming.
   */
  async importItems(items: unknown[]): Promise<number> {
    const normalizedItems = items.map(normalizeClipboardItem).filter(isClipboardItem).map(cloneClipboardItem)
    let insertedCount = 0

    for (const incoming of normalizedItems) {
      const existing = this.state.items.find((item) => createClipboardSignature(item) === createClipboardSignature(incoming))
      if (existing) {
        existing.pinned = existing.pinned || incoming.pinned
        existing.copyCount = Math.max(existing.copyCount, incoming.copyCount)
        existing.createdAt = Math.min(existing.createdAt, incoming.createdAt)
        existing.updatedAt = Math.max(existing.updatedAt, incoming.updatedAt)
        continue
      }

      this.state.items.push({
        ...incoming,
        id: this.ensureUniqueItemId(incoming.id),
      })
      insertedCount += 1
    }

    if (normalizedItems.length > 0) {
      this.trimOverflow()
      await this.save()
    }

    return insertedCount
  }

  private canCapture(text: string): boolean {
    const { captureEnabled, capturePausedUntil, minTextLength, maxTextLength } = this.state.settings
    return captureEnabled && !isCaptureTemporarilyPaused(capturePausedUntil) && text.length >= minTextLength && text.length <= maxTextLength
  }

  private canCaptureImage(byteSize: number): boolean {
    const { captureEnabled, capturePausedUntil, captureImages, maxImageBytes } = this.state.settings
    return captureEnabled && !isCaptureTemporarilyPaused(capturePausedUntil) && captureImages && byteSize > 0 && byteSize <= maxImageBytes
  }

  private canCaptureFiles(paths: string[]): boolean {
    const { captureEnabled, capturePausedUntil, captureFiles, maxFilePaths } = this.state.settings
    return (
      captureEnabled &&
      !isCaptureTemporarilyPaused(capturePausedUntil) &&
      captureFiles &&
      paths.length > 0 &&
      paths.length <= maxFilePaths
    )
  }

  private getSortedItems(): ClipboardItem[] {
    return [...this.state.items]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map(cloneClipboardItem)
  }

  private trimOverflow(): void {
    const pinned = this.state.items.filter((item) => item.pinned)
    const retentionCutoff = this.createRetentionCutoff()
    const regular = this.state.items
      .filter((item) => !item.pinned && (!retentionCutoff || item.updatedAt >= retentionCutoff))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, this.state.settings.maxHistoryItems)

    this.state.items = [...pinned, ...regular]
  }

  private createRetentionCutoff(): number | null {
    return this.state.settings.retentionDays > 0 ? Date.now() - this.state.settings.retentionDays * DAY_MS : null
  }

  private getStorageBytes(): number {
    try {
      return existsSync(this.filePath) ? statSync(this.filePath).size : 0
    } catch {
      return 0
    }
  }

  private ensureUniqueItemId(preferredId: string): string {
    if (preferredId && !this.state.items.some((item) => item.id === preferredId)) {
      return preferredId
    }

    return createItemId()
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
    captureEnabled: Boolean(settings.captureEnabled),
    capturePausedUntil: normalizePauseUntil(settings.capturePausedUntil),
    launchAtLogin: Boolean(settings.launchAtLogin),
    retentionDays: clampInteger(settings.retentionDays, 0, 3650),
    maxHistoryItems: clampInteger(settings.maxHistoryItems, 20, 3000),
    minTextLength: clampInteger(settings.minTextLength, 1, 2000),
    maxTextLength: clampInteger(settings.maxTextLength, 100, 200000),
    captureImages: Boolean(settings.captureImages),
    captureFiles: Boolean(settings.captureFiles),
    maxImageBytes: clampInteger(settings.maxImageBytes, 128 * 1024, 100 * 1024 * 1024),
    maxFilePaths: clampInteger(settings.maxFilePaths, 1, 200),
    globalShortcut:
      typeof settings.globalShortcut === 'string' && settings.globalShortcut.trim()
        ? settings.globalShortcut.trim()
        : defaultSettings.globalShortcut,
    themeAccent: normalizeThemeAccent(settings.themeAccent),
    themeMode: normalizeThemeMode(settings.themeMode),
  }
}

function normalizePauseUntil(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const timestamp = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    return null
  }

  return Math.min(timestamp, Date.now() + MAX_TEMPORARY_PAUSE_MS)
}

function isCaptureTemporarilyPaused(pausedUntil: number | null): boolean {
  return typeof pausedUntil === 'number' && pausedUntil > Date.now()
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
  const now = Date.now()
  const base = {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createItemId(),
    pinned: Boolean(item.pinned),
    copyCount: clampInteger(Number(item.copyCount), 0, Number.MAX_SAFE_INTEGER),
    createdAt: normalizeTimestamp(item.createdAt, now),
    updatedAt: normalizeTimestamp(item.updatedAt, now),
  }

  // Existing MVP stores did not have a kind field; keep those text records intact.
  if ((!item.kind || item.kind === 'text') && typeof item.text === 'string') {
    const text = normalizeClipboardText(item.text)
    return text ? { ...base, kind: 'text', text } : null
  }

  if (item.kind === 'image') {
    const image = item as Partial<ImageClipboardItem>
    if (typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/png;base64,')) {
      return null
    }

    return {
      ...base,
      kind: 'image',
      dataUrl: image.dataUrl,
      width: clampInteger(Number(image.width), 1, 100_000),
      height: clampInteger(Number(image.height), 1, 100_000),
      byteSize: clampInteger(Number(image.byteSize), 1, 100 * 1024 * 1024),
    }
  }

  if (item.kind === 'file') {
    const candidatePaths = (item as Partial<FileClipboardItem>).paths
    const paths = normalizeFilePaths(Array.isArray(candidatePaths) ? candidatePaths : [])
    return paths.length ? { ...base, kind: 'file', paths } : null
  }

  return null
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const timestamp = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : fallback
}

function createClipboardSignature(item: ClipboardItem): string {
  if (item.kind === 'image') {
    return `image:${item.dataUrl}`
  }

  if (item.kind === 'file') {
    return `file:${createFileSignature(item.paths)}`
  }

  return `text:${item.text}`
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
