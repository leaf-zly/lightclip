import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { brotliCompress, brotliDecompress, constants as zlibConstants } from 'node:zlib'
import { promisify } from 'node:util'
import { app, safeStorage } from 'electron'
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
  StorageLocationResult,
} from '../shared/types.js'

const STORE_VERSION = 1
const STORE_FILE_NAME = 'lightclip-store.json.br'
const BACKUP_STORE_FILE_NAME = `${STORE_FILE_NAME}.bak`
const LEGACY_STORE_FILE_NAME = 'lightclip-store.json'
const STORAGE_CONFIG_FILE_NAME = 'lightclip-storage.json'
const STORE_COMPRESSION = 'brotli' as const
const ENCRYPTED_STORE_COMPRESSION = 'safeStorageBrotli' as const
const ENCRYPTED_STORE_HEADER = Buffer.from('LightClipStoreSafeStorageV1\n', 'utf8')
const brotliCompressAsync = promisify(brotliCompress)
const brotliDecompressAsync = promisify(brotliDecompress)
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TEMPORARY_PAUSE_MS = DAY_MS
const themeAccents: readonly AppThemeAccent[] = ['mint', 'blue', 'violet', 'rose', 'amber']
const themeModes: readonly AppThemeMode[] = ['system', 'light', 'dark']

interface PersistedStore {
  version: number
  settings: AppSettings
  items: ClipboardItem[]
}

interface StorageConfig {
  storageDirectory?: string | null
}

interface StoreReadResult {
  store: Partial<PersistedStore>
  encrypted: boolean
}

interface StoreWriteResult {
  encrypted: boolean
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
  encryptStore: true,
  excludedAppNames: [],
  pasteAfterCopy: false,
  maxImageBytes: 5 * 1024 * 1024,
  maxFilePaths: 20,
  retentionDays: 0,
  globalShortcut: 'Alt+V',
  themeAccent: 'mint',
  themeMode: 'system',
  sensitiveContentProtection: false,
  sensitiveKeywords: [],
  maxStorageBytes: 256 * 1024 * 1024,
  automaticBackups: true,
  backupIntervalHours: 24,
  backupKeepCount: 7,
}

/**
 * Small JSON-backed persistence layer for clipboard history and settings.
 *
 * The class serializes writes to avoid corrupting the local store when several
 * clipboard or UI events arrive in quick succession.
 */
export class ClipboardStore {
  private readonly defaultStorageDirectory: string
  private readonly storageConfigPath: string
  private storageDirectory: string
  private filePath: string
  private backupFilePath: string
  private legacyFilePath: string
  private state: PersistedStore
  private storageEncrypted = false
  private pendingWrite: Promise<void> = Promise.resolve()

  constructor() {
    this.defaultStorageDirectory = app.getPath('userData')
    this.storageConfigPath = join(this.defaultStorageDirectory, STORAGE_CONFIG_FILE_NAME)
    this.storageDirectory = this.defaultStorageDirectory
    this.filePath = join(this.storageDirectory, STORE_FILE_NAME)
    this.backupFilePath = join(this.storageDirectory, BACKUP_STORE_FILE_NAME)
    this.legacyFilePath = join(this.storageDirectory, LEGACY_STORE_FILE_NAME)
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
    await this.loadStorageConfig()

    try {
      const parsed = await this.readPersistedStore()
      this.state = {
        version: STORE_VERSION,
        settings: normalizeSettings({ ...defaultSettings, ...parsed.settings }),
        items: Array.isArray(parsed.items) ? parsed.items.map(normalizeClipboardItem).filter(isClipboardItem) : [],
      }
      this.trimOverflow()
      await this.save()
    } catch (error) {
      if (!isMissingFileError(error)) {
        console.warn('Failed to load LightClip store, using defaults.', error)
        await this.quarantineUnreadableStoreFiles()
        await this.save()
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
      storageDirectory: this.storageDirectory,
      storageFilePath: this.filePath,
      storageCompression: this.storageEncrypted ? ENCRYPTED_STORE_COMPRESSION : STORE_COMPRESSION,
      storageEncrypted: this.storageEncrypted,
      encryptionAvailable: isStoreEncryptionAvailable(),
    }
  }

  /**
   * Returns the active directory containing LightClip's compressed store file.
   */
  getStorageDirectory(): string {
    return this.storageDirectory
  }

  /**
   * Returns current storage metadata for UI feedback and IPC responses.
   */
  getStorageLocation(): StorageLocationResult {
    return {
      directory: this.storageDirectory,
      filePath: this.filePath,
      storageBytes: this.getStorageBytes(),
      compression: this.storageEncrypted ? ENCRYPTED_STORE_COMPRESSION : STORE_COMPRESSION,
      encrypted: this.storageEncrypted,
      encryptionAvailable: isStoreEncryptionAvailable(),
    }
  }

  /**
   * Moves the active store to a new directory after verifying the target is writable.
   */
  async moveStorageDirectory(directory: string): Promise<StorageLocationResult> {
    const targetDirectory = resolve(directory)
    await this.pendingWrite.catch(() => undefined)
    await ensureWritableDirectory(targetDirectory)

    if (isSamePath(targetDirectory, this.storageDirectory)) {
      await this.writeStorageConfig(targetDirectory)
      await this.save()
      return this.getStorageLocation()
    }

    const previousFilePath = this.filePath
    const previousBackupFilePath = this.backupFilePath
    const previousLegacyFilePath = this.legacyFilePath
    const nextFilePath = join(targetDirectory, STORE_FILE_NAME)
    const nextBackupFilePath = join(targetDirectory, BACKUP_STORE_FILE_NAME)

    const writeResult = await writeCompressedStoreFile(
      nextFilePath,
      nextBackupFilePath,
      JSON.stringify(this.state),
      shouldEncryptStore(this.state.settings),
    )
    this.storageEncrypted = writeResult.encrypted
    await copyStoreBackup(previousFilePath, previousBackupFilePath, nextBackupFilePath)
    await this.writeStorageConfig(targetDirectory)
    this.setStorageDirectory(targetDirectory)
    await Promise.all([
      removeStoreFileIfDifferent(previousFilePath, this.filePath),
      removeStoreFileIfDifferent(previousBackupFilePath, this.backupFilePath),
      removeStoreFileIfDifferent(previousLegacyFilePath, this.filePath),
    ])

    return this.getStorageLocation()
  }

  /**
   * Moves the active store back to Electron's default user data directory.
   */
  async resetStorageDirectory(): Promise<StorageLocationResult> {
    return this.moveStorageDirectory(this.defaultStorageDirectory)
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
      if (existsSync(this.filePath)) {
        return statSync(this.filePath).size
      }

      return existsSync(this.legacyFilePath) ? statSync(this.legacyFilePath).size : 0
    } catch {
      return 0
    }
  }

  private async loadStorageConfig(): Promise<void> {
    try {
      const raw = await readFile(this.storageConfigPath, 'utf8')
      const parsed = JSON.parse(raw) as StorageConfig
      if (typeof parsed.storageDirectory === 'string' && parsed.storageDirectory.trim()) {
        const storageDirectory = resolve(parsed.storageDirectory)
        await mkdir(storageDirectory, { recursive: true })
        this.setStorageDirectory(storageDirectory)
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        console.warn('Failed to load LightClip storage location, using default directory.', error)
      }
    }
  }

  private async readPersistedStore(): Promise<Partial<PersistedStore>> {
    if (existsSync(this.filePath)) {
      try {
        const result = await readCompressedStoreFile(this.filePath)
        this.storageEncrypted = result.encrypted
        return result.store
      } catch (error) {
        console.warn('Primary LightClip store is unreadable, trying backup store.', error)
        if (existsSync(this.backupFilePath)) {
          await renameIfExists(this.filePath, `${this.filePath}.corrupt-${Date.now().toString(36)}`)
          const result = await readCompressedStoreFile(this.backupFilePath)
          this.storageEncrypted = result.encrypted
          return result.store
        }
        throw error
      }
    }

    if (existsSync(this.legacyFilePath)) {
      const raw = await readFile(this.legacyFilePath, 'utf8')
      this.storageEncrypted = false
      return JSON.parse(raw) as Partial<PersistedStore>
    }

    if (existsSync(this.backupFilePath)) {
      console.warn('Primary LightClip store is missing, restoring from backup store.')
      const result = await readCompressedStoreFile(this.backupFilePath)
      this.storageEncrypted = result.encrypted
      return result.store
    }

    const error = new Error('LightClip store file does not exist.') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    throw error
  }

  private setStorageDirectory(directory: string): void {
    this.storageDirectory = directory
    this.filePath = join(this.storageDirectory, STORE_FILE_NAME)
    this.backupFilePath = join(this.storageDirectory, BACKUP_STORE_FILE_NAME)
    this.legacyFilePath = join(this.storageDirectory, LEGACY_STORE_FILE_NAME)
  }

  private async writeStorageConfig(directory: string): Promise<void> {
    if (isSamePath(directory, this.defaultStorageDirectory)) {
      await rm(this.storageConfigPath, { force: true })
      return
    }

    await mkdir(dirname(this.storageConfigPath), { recursive: true })
    await writeFile(this.storageConfigPath, JSON.stringify({ storageDirectory: directory }, null, 2), 'utf8')
  }

  private async removeLegacyStoreFile(): Promise<void> {
    await rm(this.legacyFilePath, { force: true })
  }

  private async quarantineUnreadableStoreFiles(): Promise<void> {
    const suffix = Date.now().toString(36)
    await Promise.all([
      renameIfExists(this.filePath, `${this.filePath}.corrupt-${suffix}`),
      renameIfExists(this.backupFilePath, `${this.backupFilePath}.corrupt-${suffix}`),
      renameIfExists(this.legacyFilePath, `${this.legacyFilePath}.corrupt-${suffix}`),
    ])
  }

  private ensureUniqueItemId(preferredId: string): string {
    if (preferredId && !this.state.items.some((item) => item.id === preferredId)) {
      return preferredId
    }

    return createItemId()
  }

  private async save(): Promise<void> {
    const payload = JSON.stringify(this.state)
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.storageDirectory, { recursive: true })
        const result = await writeCompressedStoreFile(
          this.filePath,
          this.backupFilePath,
          payload,
          shouldEncryptStore(this.state.settings),
        )
        this.storageEncrypted = result.encrypted
        await this.removeLegacyStoreFile()
      })
    await this.pendingWrite
  }
}

async function readCompressedStoreFile(filePath: string): Promise<StoreReadResult> {
  const encoded = await readFile(filePath)
  const decoded = await decodeStorePayload(encoded)
  return { store: JSON.parse(decoded.raw) as Partial<PersistedStore>, encrypted: decoded.encrypted }
}

async function writeCompressedStoreFile(
  filePath: string,
  backupFilePath: string,
  payload: string,
  encrypt: boolean,
): Promise<StoreWriteResult> {
  const tempFilePath = `${filePath}.${process.pid}.tmp`
  const backupTempFilePath = `${backupFilePath}.${process.pid}.tmp`
  try {
    const encoded = await encodeStorePayload(payload, encrypt)
    await assertStorePayloadReadable(encoded.payload)
    await writeFile(tempFilePath, encoded.payload)

    // Preserve the last readable store before replacing the primary file.
    if (existsSync(filePath)) {
      await copyFile(filePath, backupTempFilePath)
      await rename(backupTempFilePath, backupFilePath)
    }

    await rename(tempFilePath, filePath)
    return { encrypted: encoded.encrypted }
  } catch (error) {
    await rm(tempFilePath, { force: true }).catch(() => undefined)
    await rm(backupTempFilePath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function copyStoreBackup(primaryFilePath: string, backupFilePath: string, targetBackupFilePath: string): Promise<void> {
  const sourcePath = existsSync(primaryFilePath) ? primaryFilePath : existsSync(backupFilePath) ? backupFilePath : null
  if (!sourcePath) {
    return
  }

  try {
    await copyFile(sourcePath, targetBackupFilePath)
  } catch (error) {
    console.warn(`Failed to copy LightClip backup store to ${targetBackupFilePath}.`, error)
  }
}

async function encodeStorePayload(payload: string, encrypt: boolean): Promise<{ payload: Buffer; encrypted: boolean }> {
  const compressed = await compressStorePayload(payload)
  if (!encrypt || !isStoreEncryptionAvailable()) {
    return { payload: compressed, encrypted: false }
  }

  return {
    payload: Buffer.concat([ENCRYPTED_STORE_HEADER, safeStorage.encryptString(compressed.toString('base64'))]),
    encrypted: true,
  }
}

async function decodeStorePayload(payload: Buffer): Promise<{ raw: string; encrypted: boolean }> {
  if (!payload.subarray(0, ENCRYPTED_STORE_HEADER.length).equals(ENCRYPTED_STORE_HEADER)) {
    return { raw: await decompressStorePayload(payload), encrypted: false }
  }

  if (!isStoreEncryptionAvailable()) {
    throw new Error('LightClip encrypted store cannot be decrypted on this Windows account.')
  }

  const encryptedBody = payload.subarray(ENCRYPTED_STORE_HEADER.length)
  const compressed = Buffer.from(safeStorage.decryptString(encryptedBody), 'base64')
  return { raw: await decompressStorePayload(compressed), encrypted: true }
}

function isStoreEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function shouldEncryptStore(settings: AppSettings): boolean {
  return Boolean(settings.encryptStore && isStoreEncryptionAvailable())
}

async function compressStorePayload(payload: string): Promise<Buffer> {
  return brotliCompressAsync(Buffer.from(payload, 'utf8'), {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
    },
  })
}

async function decompressStorePayload(payload: Buffer): Promise<string> {
  const decompressed = await brotliDecompressAsync(payload)
  return decompressed.toString('utf8')
}

async function assertStorePayloadReadable(payload: Buffer): Promise<void> {
  JSON.parse((await decodeStorePayload(payload)).raw)
}

async function renameIfExists(filePath: string, targetPath: string): Promise<void> {
  if (!existsSync(filePath)) {
    return
  }

  try {
    await rename(filePath, targetPath)
  } catch (error) {
    console.warn(`Failed to quarantine unreadable LightClip store file: ${filePath}`, error)
  }
}

async function ensureWritableDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const directoryStat = await stat(directory)
  if (!directoryStat.isDirectory()) {
    throw new Error('Selected storage path is not a directory.')
  }

  const probePath = join(directory, '.lightclip-write-test')
  await writeFile(probePath, '')
  await rm(probePath, { force: true })
}

async function removeStoreFileIfDifferent(filePath: string, activeFilePath: string): Promise<void> {
  if (isSamePath(filePath, activeFilePath)) {
    return
  }

  try {
    await rm(filePath, { force: true })
  } catch (error) {
    console.warn(`Failed to remove old LightClip store file: ${filePath}`, error)
  }
}

function isSamePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase() === resolve(right).toLocaleLowerCase()
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
    encryptStore: Boolean(settings.encryptStore),
    excludedAppNames: normalizeExcludedAppNames(settings.excludedAppNames),
    pasteAfterCopy: Boolean(settings.pasteAfterCopy),
    maxImageBytes: clampInteger(settings.maxImageBytes, 128 * 1024, 100 * 1024 * 1024),
    maxFilePaths: clampInteger(settings.maxFilePaths, 1, 200),
    globalShortcut:
      typeof settings.globalShortcut === 'string' && settings.globalShortcut.trim()
        ? settings.globalShortcut.trim()
        : defaultSettings.globalShortcut,
    themeAccent: normalizeThemeAccent(settings.themeAccent),
    themeMode: normalizeThemeMode(settings.themeMode),
    sensitiveContentProtection: Boolean(settings.sensitiveContentProtection),
    sensitiveKeywords: Array.isArray(settings.sensitiveKeywords)
      ? settings.sensitiveKeywords.filter((value): value is string => typeof value === 'string').slice(0, 100)
      : [],
    maxStorageBytes: clampInteger(settings.maxStorageBytes ?? defaultSettings.maxStorageBytes, 0, 2 * 1024 * 1024 * 1024),
    automaticBackups: settings.automaticBackups !== false,
    backupIntervalHours: clampInteger(settings.backupIntervalHours ?? 24, 1, 720),
    backupKeepCount: clampInteger(settings.backupKeepCount ?? 7, 1, 30),
  }
}

function normalizeExcludedAppNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean))).slice(0, 100)
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
