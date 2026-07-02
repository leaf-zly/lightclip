import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  Menu,
  Tray,
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  shell,
} from 'electron'
import { ClipboardStore } from './store.js'
import { IPC_CHANNELS, type AppSettings, type ClipboardItem, type CommandResult } from '../shared/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const store = new ClipboardStore()
const appIconPath = getAppIconPath()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let clipboardTimer: NodeJS.Timeout | null = null
let lastClipboardSignature = ''
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
  applyLaunchAtLogin(store.getState().settings.launchAtLogin)
  createTray()
  createWindow()
  registerGlobalShortcut(store.getState().settings.globalShortcut)
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
        shell.openPath(app.getPath('userData')).catch(console.error)
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

function createApplicationMenuTemplate(): Record<string, Electron.MenuItemConstructorOptions[]> {
  return {
    file: [
      { label: '打开 LightClip', click: showPanel },
      { label: '隐藏到托盘', click: hidePanel },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ],
    edit: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'delete', label: '删除' },
      { type: 'separator' },
      { role: 'selectAll', label: '全选' },
    ],
    view: [
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '重置缩放' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' },
    ],
    window: [
      { role: 'minimize', label: '最小化' },
      { label: '最大化/还原', click: toggleMaximizeWindow },
      { label: '关闭到托盘', click: hidePanel },
    ],
  }
}

function showNativeMenu(menuName: keyof ReturnType<typeof createApplicationMenuTemplate>): void {
  const template = createApplicationMenuTemplate()[menuName]
  if (!template || !mainWindow) {
    return
  }

  Menu.buildFromTemplate(template).popup({ window: mainWindow })
}

/**
 * Registers or replaces the global shortcut used to toggle the quick panel.
 */
function registerGlobalShortcut(accelerator: string): void {
  globalShortcut.unregisterAll()
  const registered = globalShortcut.register(accelerator, () => {
    if (mainWindow?.isVisible()) {
      hidePanel()
    } else {
      showPanel()
    }
  })

  if (!registered) {
    console.warn(`Unable to register global shortcut: ${accelerator}`)
  }
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
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: isDevelopment ? [app.getAppPath(), '--hidden'] : ['--hidden'],
  })
}

/**
 * Detects launches initiated by the OS startup registration.
 */
function shouldStartHidden(): boolean {
  return process.argv.includes('--hidden')
}

async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const previousShortcut = store.getState().settings.globalShortcut
  const nextSettings = await store.updateSettings(settings)
  applyLaunchAtLogin(nextSettings.launchAtLogin)

  if (nextSettings.globalShortcut !== previousShortcut) {
    registerGlobalShortcut(nextSettings.globalShortcut)
  }

  updateTrayMenu()
  broadcastState()
  return nextSettings
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
ipcMain.handle(IPC_CHANNELS.showMenu, (_event, menuName: 'file' | 'edit' | 'view' | 'window') => showNativeMenu(menuName))
ipcMain.handle(IPC_CHANNELS.hidePanel, () => hidePanel())
ipcMain.handle(IPC_CHANNELS.quit, () => {
  isQuitting = true
  app.quit()
})
