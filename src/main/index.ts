import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  Menu,
  Tray,
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'
import { ClipboardStore } from './store.js'
import {
  IPC_CHANNELS,
  type AppSettings,
  type ClipboardItem,
  type ClipboardItemKind,
  type CommandResult,
  type HistoryExportResult,
  type HistoryExportSnapshot,
  type HistoryImportResult,
  type StorageLocationResult,
} from '../shared/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const store = new ClipboardStore()
const appIconPath = getAppIconPath()
const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const LIGHTCLIP_STARTUP_ENTRY_NAMES = ['electron.app.Electron', 'electron.app.LightClip']
const FALLBACK_GLOBAL_SHORTCUT = 'Alt+V'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let clipboardTimer: NodeJS.Timeout | null = null
let lastClipboardSignature = ''
let activeGlobalShortcut = ''
let isQuitting = false

interface ClipboardSnapshot {
  signature: string
  text: string
  image: {
    dataUrl: string
    width: number
    height: number
    byteSize: number
  } | null
  files: string[]
}

/**
 * Application bootstrap. Loads state, registers OS integrations, then opens the quick panel.
 */
async function bootstrap(): Promise<void> {
  await store.load()
  cleanupLegacyDevelopmentLoginItems()
  applyLaunchAtLogin(store.getState().settings.launchAtLogin)
  Menu.setApplicationMenu(null)
  createTray()
  createWindow()
  await registerStoredGlobalShortcut()
  startClipboardWatcher()

  if (!shouldStartHidden()) {
    showPanel()
  }
}

app.setName('LightClip')

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showPanel()
  })

  app.whenReady().then(bootstrap).catch((error) => {
    console.error('Failed to start LightClip.', error)
    app.quit()
  })
}

app.on('window-all-closed', () => {
  // Keep the tray process alive when the quick panel is hidden or closed.
})

app.on('will-quit', () => {
  if (clipboardTimer) {
    clearInterval(clipboardTimer)
  }
  globalShortcut.unregisterAll()
})

/**
 * Creates the frameless quick panel window used as the primary interface.
 */
function createWindow(): BrowserWindow {
  if (mainWindow) {
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 860,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    title: 'LightClip',
    icon: appIconPath,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101114' : '#f7f8fb',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * Shows the quick panel near the active display, similar to a launcher.
 */
function showPanel(): void {
  const window = createWindow()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const bounds = display.workArea
  const size = window.getBounds()

  window.setBounds({
    width: size.width,
    height: size.height,
    x: Math.round(bounds.x + (bounds.width - size.width) / 2),
    y: Math.round(bounds.y + Math.max(24, (bounds.height - size.height) * 0.18)),
  })
  window.show()
  window.focus()
  window.webContents.send(IPC_CHANNELS.stateChanged, store.getState())
}

function hidePanel(): void {
  mainWindow?.hide()
}

function minimizeWindow(): void {
  mainWindow?.minimize()
}

function toggleMaximizeWindow(): void {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
}

/**
 * Builds a small tray menu with the core background controls.
 */
function createTray(): void {
  if (tray) {
    return
  }

  tray = new Tray(createTrayImage())
  tray.setToolTip('LightClip')
  tray.on('click', showPanel)
  updateTrayMenu()
}

function updateTrayMenu(): void {
  if (!tray) {
    return
  }

  const { settings } = store.getState()
  const menu = Menu.buildFromTemplate([
    { label: '打开 LightClip', click: showPanel },
    {
      label: settings.captureEnabled ? '暂停记录' : '恢复记录',
      click: () => {
        updateSettings({ captureEnabled: !settings.captureEnabled }).catch(console.error)
      },
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: settings.launchAtLogin,
      click: (menuItem) => {
        updateSettings({ launchAtLogin: menuItem.checked }).catch(console.error)
      },
    },
    { type: 'separator' },
    {
      label: '打开数据目录',
      click: () => {
        shell.openPath(store.getStorageDirectory()).catch(console.error)
      },
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
}


/**
 * Registers the persisted shortcut, falling back once to the default shortcut
 * when an older or externally occupied accelerator cannot be used.
 */
async function registerStoredGlobalShortcut(): Promise<void> {
  const { globalShortcut: configuredShortcut } = store.getState().settings
  if (registerGlobalShortcut(configuredShortcut)) {
    return
  }

  if (configuredShortcut === FALLBACK_GLOBAL_SHORTCUT || !registerGlobalShortcut(FALLBACK_GLOBAL_SHORTCUT)) {
    return
  }

  await store.updateSettings({ globalShortcut: FALLBACK_GLOBAL_SHORTCUT }).catch((error) => {
    console.warn('Failed to persist fallback global shortcut.', error)
  })
}

/**
 * Registers or replaces the global shortcut used to toggle the quick panel.
 */
function registerGlobalShortcut(accelerator: string): boolean {
  const normalizedAccelerator = accelerator.trim()
  if (!normalizedAccelerator) {
    console.warn('Unable to register empty global shortcut.')
    return false
  }

  globalShortcut.unregisterAll()
  try {
    const registered = globalShortcut.register(normalizedAccelerator, () => {
      if (mainWindow?.isVisible()) {
        hidePanel()
      } else {
        showPanel()
      }
    })

    if (registered) {
      activeGlobalShortcut = normalizedAccelerator
      return true
    }
  } catch (error) {
    console.warn(`Unable to register global shortcut: ${normalizedAccelerator}`, error)
  }

  activeGlobalShortcut = ''
  console.warn(`Unable to register global shortcut: ${normalizedAccelerator}`)
  return false
}

/**
 * Polls the system clipboard for text changes without storing generated duplicates.
 */
function startClipboardWatcher(): void {
  lastClipboardSignature = readClipboardSnapshot(store.getState().settings).signature
  clipboardTimer = setInterval(async () => {
    const snapshot = readClipboardSnapshot(store.getState().settings)
    if (!snapshot.signature || snapshot.signature === lastClipboardSignature) {
      return
    }

    lastClipboardSignature = snapshot.signature
    const recorded = await recordClipboardSnapshot(snapshot)
    if (recorded) {
      broadcastState()
    }
  }, 650)
}

/**
 * Records the richest enabled clipboard payload from a snapshot.
 */
async function recordClipboardSnapshot(snapshot: ClipboardSnapshot): Promise<ClipboardItem | null> {
  const { settings } = store.getState()

  if (settings.captureFiles && snapshot.files.length > 0) {
    return store.recordFiles(snapshot.files)
  }

  if (settings.captureImages && snapshot.image) {
    return store.recordImage(
      snapshot.image.dataUrl,
      { width: snapshot.image.width, height: snapshot.image.height },
      snapshot.image.byteSize,
    )
  }

  return store.recordText(snapshot.text)
}

/**
 * Reads all supported clipboard payloads and creates a stable change signature.
 */
function readClipboardSnapshot(settings: AppSettings): ClipboardSnapshot {
  const text = clipboard.readText()
  const files = settings.captureFiles ? readClipboardFiles(text) : []
  const image = settings.captureImages ? readClipboardImage() : null
  const signatureParts = [
    text ? `text:${text}` : '',
    files.length ? `files:${files.join('\n')}` : '',
    image ? `image:${image.byteSize}:${image.width}x${image.height}:${image.dataUrl.slice(0, 96)}` : '',
  ].filter(Boolean)

  return {
    signature: signatureParts.join('|'),
    text,
    image,
    files,
  }
}

function readClipboardImage(): ClipboardSnapshot['image'] {
  const image = clipboard.readImage()
  if (image.isEmpty()) {
    return null
  }

  const png = image.toPNG()
  const size = image.getSize()
  return {
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    width: size.width,
    height: size.height,
    byteSize: png.byteLength,
  }
}

function readClipboardFiles(textFallback: string): string[] {
  const paths = new Set<string>()

  for (const path of readFilePathsFromText(textFallback)) {
    paths.add(path)
  }

  for (const path of readFilePathsFromFormat('FileNameW', 'utf16le')) {
    paths.add(path)
  }

  for (const path of readFilePathsFromFormat('FileName', 'latin1')) {
    paths.add(path)
  }

  return [...paths]
}

function readFilePathsFromText(text: string): string[] {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .map((line) => {
      if (line.startsWith('file://')) {
        try {
          return fileURLToPath(line)
        } catch {
          return ''
        }
      }
      return line
    })
    .filter((line) => isAbsolute(line) && existsSync(line))
}

function readFilePathsFromFormat(format: string, encoding: BufferEncoding): string[] {
  if (!clipboard.availableFormats().includes(format)) {
    return []
  }

  const buffer = clipboard.readBuffer(format)
  if (!buffer.byteLength) {
    return []
  }

  return buffer
    .toString(encoding)
    .split('\u0000')
    .map((path) => path.trim())
    .filter((path) => isAbsolute(path) && existsSync(path))
}

/**
 * Enables or disables current-user startup registration.
 */
function applyLaunchAtLogin(enabled: boolean): void {
  const canRegisterStartup = app.isPackaged && !process.defaultApp
  app.setLoginItemSettings({
    openAtLogin: enabled && canRegisterStartup,
    path: process.execPath,
    args: enabled && canRegisterStartup ? ['--hidden'] : [],
  })

  if (enabled && !canRegisterStartup) {
    console.warn('Skipping launch-at-login registration outside the packaged LightClip runtime.')
  }
}

/**
 * Detects launches initiated by the OS startup registration.
 */
function shouldStartHidden(): boolean {
  return process.argv.includes('--hidden')
}

/**
 * Removes old startup entries created by development or preview runs that
 * pointed Windows at Electron itself instead of the packaged LightClip binary.
 */
function cleanupLegacyDevelopmentLoginItems(): void {
  if (process.platform !== 'win32') {
    return
  }

  for (const entryName of LIGHTCLIP_STARTUP_ENTRY_NAMES) {
    const command = readWindowsRunEntry(entryName)
    if (command && isDevelopmentElectronStartupCommand(command)) {
      deleteWindowsRunEntry(entryName)
    }
  }
}

function readWindowsRunEntry(entryName: string): string | null {
  const result = spawnSync('reg.exe', ['query', WINDOWS_RUN_KEY, '/v', entryName], {
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.status !== 0 || !result.stdout) {
    return null
  }

  const line = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith(entryName))
  const match = line?.match(/\sREG_\w+\s+(.+)$/)
  return match?.[1]?.trim() ?? null
}

function deleteWindowsRunEntry(entryName: string): void {
  const result = spawnSync('reg.exe', ['delete', WINDOWS_RUN_KEY, '/v', entryName, '/f'], {
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.status !== 0) {
    console.warn(`Failed to remove legacy startup entry ${entryName}.`, result.stderr || result.stdout)
  }
}

function isDevelopmentElectronStartupCommand(command: string): boolean {
  const normalized = command.toLocaleLowerCase()
  return normalized.includes('lightclip') && normalized.includes('node_modules') && normalized.includes('electron.exe')
}

async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const previousSettings = store.getState().settings
  const requestedShortcut = typeof settings.globalShortcut === 'string' ? settings.globalShortcut.trim() : undefined
  const shortcutChanged = Boolean(requestedShortcut && requestedShortcut !== previousSettings.globalShortcut)

  if (settings.globalShortcut !== undefined && !requestedShortcut) {
    throw new Error('快捷键不能为空，例如 Alt+V')
  }

  if (shortcutChanged && requestedShortcut && !registerGlobalShortcut(requestedShortcut)) {
    registerGlobalShortcut(previousSettings.globalShortcut)
    throw new Error(`快捷键 ${requestedShortcut} 不可用或已被占用，请换一个组合`)
  }

  try {
    const nextSettings = await store.updateSettings(settings)
    applyLaunchAtLogin(nextSettings.launchAtLogin)
    updateTrayMenu()
    broadcastState()
    return nextSettings
  } catch (error) {
    if (shortcutChanged && activeGlobalShortcut !== previousSettings.globalShortcut) {
      registerGlobalShortcut(previousSettings.globalShortcut)
    }
    throw error
  }
}

function broadcastState(): void {
  mainWindow?.webContents.send(IPC_CHANNELS.stateChanged, store.getState())
}

function createTrayImage(): Electron.NativeImage {
  const fileImage = nativeImage.createFromPath(appIconPath)
  if (!fileImage.isEmpty()) {
    return fileImage.resize({ width: 24, height: 24 })
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#181a20"/>
      <path d="M10 8.8h12a2 2 0 0 1 2 2v11.4a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10.8a2 2 0 0 1 2-2Z" fill="#f7f8fb"/>
      <path d="M12.5 7h7a2 2 0 0 1 2 2v1.2h-11V9a2 2 0 0 1 2-2Z" fill="#6ee7b7"/>
      <path d="M12 14h8M12 18h6" stroke="#181a20" stroke-width="2" stroke-linecap="round"/>
    </svg>`

  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  image.setTemplateImage(false)
  return image
}

function getAppIconPath(): string {
  const pngPath = join(app.getAppPath(), 'resources', 'lightclip-icon.png')
  if (existsSync(pngPath)) {
    return pngPath
  }

  return join(app.getAppPath(), 'resources', 'lightclip-icon.svg')
}

ipcMain.handle(IPC_CHANNELS.getState, () => store.getState())

ipcMain.handle(IPC_CHANNELS.copyItem, async (_event, id: string): Promise<CommandResult<ClipboardItem>> => {
  const item = store.getItem(id)
  if (!item) {
    return { ok: false, error: '记录不存在' }
  }

  writeItemToClipboard(item)
  lastClipboardSignature = readClipboardSnapshot(store.getState().settings).signature
  const updated = await store.touchCopiedItem(id)
  broadcastState()
  hidePanel()
  return { ok: true, data: updated ?? item }
})

function writeItemToClipboard(item: ClipboardItem): void {
  if (item.kind === 'image') {
    clipboard.writeImage(nativeImage.createFromDataURL(item.dataUrl))
    return
  }

  if (item.kind === 'file') {
    if (writeFileDropListToClipboard(item.paths)) {
      return
    }

    const text = item.paths.join('\r\n')
    clipboard.write({
      text,
      html: item.paths.map((path) => `<a href="${pathToFileURL(path).toString()}">${escapeHtml(path)}</a>`).join('<br>'),
    })
    return
  }

  clipboard.writeText(item.text)
}

/**
 * Writes a true Windows file-drop clipboard payload so Explorer can paste files directly.
 *
 * Electron cannot set CF_HDROP directly from JavaScript, so on Windows we use
 * the built-in STA clipboard API exposed by System.Windows.Forms. The caller
 * falls back to text/HTML if this helper is unavailable.
 */
function writeFileDropListToClipboard(paths: string[]): boolean {
  if (process.platform !== 'win32' || paths.length === 0) {
    return false
  }

  const encodedPaths = Buffer.from(JSON.stringify(paths), 'utf8').toString('base64')
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[0]))',
    '$paths = $json | ConvertFrom-Json',
    '$collection = New-Object System.Collections.Specialized.StringCollection',
    'foreach ($path in $paths) { [void]$collection.Add([string]$path) }',
    '[System.Windows.Forms.Clipboard]::SetFileDropList($collection)',
  ].join('; ')

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script, encodedPaths],
    { windowsHide: true, timeout: 5000 },
  )

  if (result.error || result.status !== 0) {
    console.warn('Failed to write Windows file-drop clipboard payload.', result.error ?? result.stderr.toString())
    return false
  }

  return true
}

function isClipboardItemKind(value: unknown): value is ClipboardItemKind {
  return value === 'text' || value === 'image' || value === 'file'
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

ipcMain.handle(IPC_CHANNELS.deleteItem, async (_event, id: string): Promise<CommandResult> => {
  const deleted = await store.deleteItem(id)
  if (!deleted) {
    return { ok: false, error: '记录不存在' }
  }

  broadcastState()
  return { ok: true }
})

ipcMain.handle(IPC_CHANNELS.togglePin, async (_event, id: string): Promise<CommandResult<ClipboardItem>> => {
  const item = await store.togglePin(id)
  if (!item) {
    return { ok: false, error: '记录不存在' }
  }

  broadcastState()
  return { ok: true, data: item }
})

ipcMain.handle(IPC_CHANNELS.clearHistory, async (): Promise<CommandResult> => {
  await store.clearHistory()
  broadcastState()
  return { ok: true }
})

ipcMain.handle(IPC_CHANNELS.clearByKind, async (_event, kind: ClipboardItemKind): Promise<CommandResult> => {
  if (!isClipboardItemKind(kind)) {
    return { ok: false, error: '不支持的历史类型' }
  }

  await store.clearByKind(kind)
  broadcastState()
  return { ok: true }
})

ipcMain.handle(IPC_CHANNELS.exportHistory, async (): Promise<CommandResult<HistoryExportResult>> => {
  try {
    const snapshot = store.createExportSnapshot()
    const saveOptions: SaveDialogOptions = {
      title: '导出 LightClip 历史',
      defaultPath: `LightClip-history-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'LightClip History', extensions: ['json'] }],
    }
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, saveOptions) : await dialog.showSaveDialog(saveOptions)

    if (result.canceled || !result.filePath) {
      return { ok: true }
    }

    await writeFile(result.filePath, JSON.stringify(snapshot, null, 2), 'utf8')
    return { ok: true, data: { filePath: result.filePath, itemCount: snapshot.items.length } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '导出失败' }
  }
})

ipcMain.handle(IPC_CHANNELS.importHistory, async (): Promise<CommandResult<HistoryImportResult>> => {
  try {
    const openOptions: OpenDialogOptions = {
      title: '导入 LightClip 历史',
      properties: ['openFile'],
      filters: [{ name: 'LightClip History', extensions: ['json'] }],
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, openOptions) : await dialog.showOpenDialog(openOptions)

    const [filePath] = result.filePaths
    if (result.canceled || !filePath) {
      return { ok: true }
    }

    const raw = await readFile(filePath, 'utf8')
    const snapshot = JSON.parse(raw) as Partial<HistoryExportSnapshot>
    if (!Array.isArray(snapshot.items)) {
      return { ok: false, error: '导入文件格式不正确' }
    }

    const importedCount = await store.importItems(snapshot.items)
    broadcastState()
    return { ok: true, data: { filePath, importedCount, totalCount: store.getState().items.length } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '导入失败' }
  }
})

ipcMain.handle(IPC_CHANNELS.selectStorageDirectory, async (): Promise<CommandResult<StorageLocationResult>> => {
  try {
    const openOptions: OpenDialogOptions = {
      title: '选择 LightClip 存储目录',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, openOptions) : await dialog.showOpenDialog(openOptions)
    const [directory] = result.filePaths
    if (result.canceled || !directory) {
      return { ok: true }
    }

    const location = await store.moveStorageDirectory(directory)
    broadcastState()
    return { ok: true, data: location }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '切换存储位置失败' }
  }
})

ipcMain.handle(IPC_CHANNELS.resetStorageDirectory, async (): Promise<CommandResult<StorageLocationResult>> => {
  try {
    const location = await store.resetStorageDirectory()
    broadcastState()
    return { ok: true, data: location }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '恢复默认存储位置失败' }
  }
})

ipcMain.handle(IPC_CHANNELS.openStorageDirectory, async (): Promise<CommandResult> => {
  const error = await shell.openPath(store.getStorageDirectory())
  return error ? { ok: false, error } : { ok: true }
})

ipcMain.handle(
  IPC_CHANNELS.updateSettings,
  async (_event, settings: Partial<AppSettings>): Promise<CommandResult<AppSettings>> => {
    try {
      const nextSettings = await updateSettings(settings)
      return { ok: true, data: nextSettings }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '设置保存失败' }
    }
  },
)

ipcMain.handle(IPC_CHANNELS.showPanel, () => showPanel())
ipcMain.handle(IPC_CHANNELS.minimizeWindow, () => minimizeWindow())
ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, () => toggleMaximizeWindow())
ipcMain.handle(IPC_CHANNELS.closeWindow, () => hidePanel())
ipcMain.handle(IPC_CHANNELS.hidePanel, () => hidePanel())
ipcMain.handle(IPC_CHANNELS.quit, () => {
  isQuitting = true
  app.quit()
})
