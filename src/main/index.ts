import { existsSync } from 'node:fs'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
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
  type UpdateCheckResult,
} from '../shared/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const store = new ClipboardStore()
const appIconPath = getAppIconPath()
const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const LIGHTCLIP_STARTUP_ENTRY_NAMES = ['electron.app.Electron', 'electron.app.LightClip']
const FALLBACK_GLOBAL_SHORTCUT = 'Alt+V'
const RELEASE_API_URL = 'https://api.github.com/repos/leaf-zly/lightclip/releases/latest'
const RELEASE_URL_PREFIX = 'https://github.com/leaf-zly/lightclip/'
const PASTE_HELPER_FILE_NAME = 'lightclip-paste-helper.ps1'
/**
 * Warm PowerShell helper used by paste-after-copy.
 * It captures the foreground window plus focused child control, restores that focus, and sends Ctrl+V
 * without spawning a new shell for every paste.
 */
const PASTE_HELPER_SCRIPT = String.raw`param([string] $OnceTargetWindow = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$memberDefinition = @(
  '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);',
  '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
  '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
  '[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);',
  '[DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);',
  '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);',
  '[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);',
  '[DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);',
  '[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
  'public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
  'public struct GUITHREADINFO { public int cbSize; public int flags; public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture; public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret; public RECT rcCaret; }'
) -join ' '
Add-Type -Namespace LightClip -Name NativeMethods -MemberDefinition $memberDefinition
$script:SW_RESTORE = 9
$script:ZERO_HANDLE = [System.IntPtr]::Zero

function Write-LightClipResponse {
  param([string] $RequestId, [string] $Status, [string] $Payload = '')
  $safePayload = $Payload -replace '\r', ' ' -replace '\n', ' ' -replace '\|', '/'
  [Console]::Out.WriteLine($RequestId + '|' + $Status + '|' + $safePayload)
  [Console]::Out.Flush()
}

function Convert-LightClipWindowHandle {
  param([string] $Value)
  [int64] $handleValue = 0
  if (-not [Int64]::TryParse($Value, [ref] $handleValue) -or $handleValue -le 0) {
    return $script:ZERO_HANDLE
  }

  return [System.IntPtr] $handleValue
}

function Get-LightClipWindowThreadId {
  param([System.IntPtr] $WindowHandle)
  if ($WindowHandle -eq $script:ZERO_HANDLE) {
    return 0
  }

  [uint32] $processId = 0
  return [LightClip.NativeMethods]::GetWindowThreadProcessId($WindowHandle, [ref] $processId)
}

function Get-LightClipFocusedWindow {
  param([System.IntPtr] $ForegroundWindow)
  $threadId = Get-LightClipWindowThreadId $ForegroundWindow
  if ($threadId -eq 0) {
    return $script:ZERO_HANDLE
  }

  $info = New-Object LightClip.NativeMethods+GUITHREADINFO
  $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
  if ([LightClip.NativeMethods]::GetGUIThreadInfo($threadId, [ref] $info) -and $info.hwndFocus -ne $script:ZERO_HANDLE) {
    return $info.hwndFocus
  }

  return $script:ZERO_HANDLE
}

function Get-LightClipForegroundTarget {
  $foregroundWindow = [LightClip.NativeMethods]::GetForegroundWindow()
  if ($foregroundWindow -eq $script:ZERO_HANDLE) {
    return '0;0'
  }

  $focusedWindow = Get-LightClipFocusedWindow $foregroundWindow
  return $foregroundWindow.ToInt64().ToString() + ';' + $focusedWindow.ToInt64().ToString()
}

function Split-LightClipTargetWindow {
  param([string] $WindowHandle)
  $parts = $WindowHandle -split ';', 2
  $topLevelWindow = if ($parts.Length -ge 1) { Convert-LightClipWindowHandle $parts[0] } else { $script:ZERO_HANDLE }
  $focusedWindow = if ($parts.Length -ge 2) { Convert-LightClipWindowHandle $parts[1] } else { $script:ZERO_HANDLE }

  if ($focusedWindow -ne $script:ZERO_HANDLE -and -not [LightClip.NativeMethods]::IsWindow($focusedWindow)) {
    $focusedWindow = $script:ZERO_HANDLE
  }

  return @{ TopLevel = $topLevelWindow; Focused = $focusedWindow }
}

function Invoke-LightClipActivateWindow {
  param([string] $WindowHandle)
  $target = Split-LightClipTargetWindow $WindowHandle
  [System.IntPtr] $windowHandle = $target.TopLevel
  [System.IntPtr] $focusedWindow = $target.Focused
  if ($windowHandle -eq $script:ZERO_HANDLE -or -not [LightClip.NativeMethods]::IsWindow($windowHandle)) {
    return
  }

  $currentThreadId = [LightClip.NativeMethods]::GetCurrentThreadId()
  $targetThreadId = Get-LightClipWindowThreadId $windowHandle
  $foregroundThreadId = Get-LightClipWindowThreadId ([LightClip.NativeMethods]::GetForegroundWindow())
  $attachedTarget = $false
  $attachedForeground = $false

  try {
    # Temporarily join input queues so Windows allows the background helper to restore focus to the captured app.
    if ($targetThreadId -ne 0 -and $targetThreadId -ne $currentThreadId) {
      $attachedTarget = [LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $targetThreadId, $true)
    }
    if ($foregroundThreadId -ne 0 -and $foregroundThreadId -ne $currentThreadId -and $foregroundThreadId -ne $targetThreadId) {
      $attachedForeground = [LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $foregroundThreadId, $true)
    }

    [void] [LightClip.NativeMethods]::ShowWindowAsync($windowHandle, $script:SW_RESTORE)
    Start-Sleep -Milliseconds 40
    [void] [LightClip.NativeMethods]::BringWindowToTop($windowHandle)
    [void] [LightClip.NativeMethods]::SetForegroundWindow($windowHandle)
    if ($focusedWindow -ne $script:ZERO_HANDLE) {
      [void] [LightClip.NativeMethods]::SetFocus($focusedWindow)
    }
  } finally {
    if ($attachedForeground) {
      [void] [LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $foregroundThreadId, $false)
    }
    if ($attachedTarget) {
      [void] [LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $targetThreadId, $false)
    }
  }
}

function Invoke-LightClipPaste {
  param([string] $WindowHandle)
  Invoke-LightClipActivateWindow $WindowHandle
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}

if ($OnceTargetWindow -ne '') {
  Invoke-LightClipPaste $OnceTargetWindow
  exit 0
}

[Console]::Out.WriteLine('ready|ok|')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {
    exit 0
  }

  $parts = $line -split '\|', 3
  if ($parts.Length -lt 2) {
    continue
  }

  $requestId = $parts[0]
  $command = $parts[1].Trim().ToLowerInvariant()
  $payload = if ($parts.Length -ge 3) { $parts[2] } else { '' }

  try {
    switch ($command) {
      'capture' {
        Write-LightClipResponse $requestId 'ok' (Get-LightClipForegroundTarget)
      }
      'paste' {
        Invoke-LightClipPaste $payload
        Write-LightClipResponse $requestId 'ok' ''
      }
      'quit' {
        Write-LightClipResponse $requestId 'ok' ''
        exit 0
      }
      default {
        Write-LightClipResponse $requestId 'error' ('Unknown command: ' + $command)
      }
    }
  } catch {
    Write-LightClipResponse $requestId 'error' $_.Exception.Message
  }
}
`

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let clipboardTimer: NodeJS.Timeout | null = null
let lastClipboardSignature = ''
let activeGlobalShortcut = ''
let isQuitting = false
let pasteHelperProcess: ChildProcessWithoutNullStreams | null = null
let pasteHelperStartPromise: Promise<void> | null = null
let pasteHelperScriptPath: string | null = null
let pasteHelperStdoutBuffer = ''
let pasteHelperRequestId = 0
let pasteTargetWindowHandle: string | null = null
const pasteHelperRequests = new Map<number, PasteHelperRequest>()

function debugPasteFlow(event: string, details: Record<string, unknown> = {}): void {
  const debugLogPath = process.env.LIGHTCLIP_PASTE_DEBUG_LOG?.trim()
  if (!debugLogPath) {
    return
  }

  const line = JSON.stringify({ time: new Date().toISOString(), event, ...details }) + '\n'
  void appendFile(debugLogPath, line, 'utf8').catch(() => {
    // Debug logging must never affect clipboard or paste delivery.
  })
}

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
 * Metadata produced while writing a history item back to the system clipboard.
 */
interface ClipboardWriteMetadata {
  /** Expected watcher signature for the clipboard payload written by LightClip. */
  signature: string
}

interface PasteHelperRequest {
  resolve: (payload: string) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
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
  syncPasteHelperProcess(store.getState().settings.pasteAfterCopy)

  if (!shouldStartHidden()) {
    await showPanel()
  }
}

app.setName('LightClip')

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    void showPanel()
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
  stopPasteHelperProcess()
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
async function showPanel(): Promise<void> {
  await rememberPasteTargetWindow()
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
  tray.on('click', () => {
    void showPanel()
  })
  updateTrayMenu()
}

function updateTrayMenu(): void {
  if (!tray) {
    return
  }

  const { settings } = store.getState()
  const menu = Menu.buildFromTemplate([
    {
      label: '打开 LightClip',
      click: () => {
        void showPanel()
      },
    },
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
        void showPanel()
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

  if (settings.excludedAppNames.length > 0 && isForegroundAppExcluded(settings.excludedAppNames)) {
    return null
  }

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
  return {
    signature: createSnapshotSignature(text, files, image),
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
 * Checks the current foreground process against user-configured privacy exclusions.
 */
function isForegroundAppExcluded(excludedAppNames: string[]): boolean {
  const foregroundProcessName = readForegroundProcessName()
  if (!foregroundProcessName) {
    return false
  }

  const normalizedForegroundName = normalizeProcessName(foregroundProcessName)
  return excludedAppNames.some((appName) => normalizeProcessName(appName) === normalizedForegroundName)
}

function readForegroundProcessName(): string | null {
  if (process.platform !== 'win32') {
    return null
  }

  const script = [
    '$ErrorActionPreference = "Stop"',
    `Add-Type -Namespace LightClip -Name Foreground -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);'`,
    '$hwnd = [LightClip.Foreground]::GetForegroundWindow()',
    '[uint32]$processId = 0',
    '[void][LightClip.Foreground]::GetWindowThreadProcessId($hwnd, [ref]$processId)',
    'if ($processId -gt 0) { (Get-Process -Id $processId).ProcessName }',
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 2500,
  })

  if (result.error || result.status !== 0) {
    console.warn('Failed to read foreground process name.', result.error ?? result.stderr)
    return null
  }

  return result.stdout.trim() || null
}

function normalizeProcessName(value: string): string {
  return value.trim().replace(/\.exe$/i, '').toLocaleLowerCase()
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
    syncPasteHelperProcess(nextSettings.pasteAfterCopy)
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

  const settings = store.getState().settings
  const { pasteAfterCopy } = settings
  // Hide before clipboard writes, file-drop PowerShell work, or encrypted store persistence can block the visible path.
  hidePanel()
  const writeMetadata = writeItemToClipboard(item, settings)
  lastClipboardSignature = writeMetadata.signature
  if (pasteAfterCopy) {
    pasteIntoForegroundApp()
  }
  void persistCopiedItemUsage(id)
  return { ok: true, data: item }
})

function writeItemToClipboard(item: ClipboardItem, settings: AppSettings): ClipboardWriteMetadata {
  if (item.kind === 'image') {
    clipboard.writeImage(nativeImage.createFromDataURL(item.dataUrl))
    return { signature: createImageClipboardSignature(item, settings) }
  }

  if (item.kind === 'file') {
    if (writeFileDropListToClipboard(item.paths)) {
      return { signature: createFileClipboardSignature(item.paths, '', settings) }
    }

    const text = item.paths.join('\r\n')
    clipboard.write({
      text,
      html: item.paths.map((path) => `<a href="${pathToFileURL(path).toString()}">${escapeHtml(path)}</a>`).join('<br>'),
    })
    return { signature: createFileClipboardSignature(item.paths, text, settings) }
  }

  clipboard.writeText(item.text)
  return { signature: createTextClipboardSignature(item.text, settings) }
}

function createTextClipboardSignature(text: string, settings: AppSettings): string {
  const files = settings.captureFiles ? readFilePathsFromText(text) : []
  return createSnapshotSignature(text, files, null)
}

function createImageClipboardSignature(item: ClipboardItem, settings: AppSettings): string {
  if (item.kind !== 'image' || !settings.captureImages) {
    return ''
  }

  return createSnapshotSignature('', [], {
    dataUrl: item.dataUrl,
    width: item.width,
    height: item.height,
    byteSize: item.byteSize,
  })
}

function createFileClipboardSignature(paths: string[], textFallback: string, settings: AppSettings): string {
  return createSnapshotSignature(textFallback, settings.captureFiles ? paths : [], null)
}

function createSnapshotSignature(text: string, files: string[], image: ClipboardSnapshot['image']): string {
  // Keep this format shared by live polling and manual copy writes to avoid re-recording LightClip's own clipboard updates.
  const signatureParts = [
    text ? `text:${text}` : '',
    files.length ? `files:${files.join('\n')}` : '',
    image ? `image:${image.byteSize}:${image.width}x${image.height}:${image.dataUrl.slice(0, 96)}` : '',
  ].filter(Boolean)

  return signatureParts.join('|')
}

async function persistCopiedItemUsage(id: string): Promise<void> {
  // Copy counters are useful metadata, but saving them must never delay panel dismissal or paste delivery.
  try {
    await store.touchCopiedItem(id)
    broadcastState()
  } catch (error) {
    console.warn('Failed to persist copied item usage.', error)
  }
}

/**
 * Requests Ctrl+V in the foreground app after the panel has been hidden and the clipboard has been updated.
 */
function pasteIntoForegroundApp(): void {
  if (process.platform !== 'win32') {
    return
  }

  void sendPasteCommandToForegroundApp()
}

function syncPasteHelperProcess(enabled: boolean): void {
  if (process.platform !== 'win32') {
    return
  }

  if (enabled) {
    void ensurePasteHelperProcess()
    return
  }

  stopPasteHelperProcess()
}

async function rememberPasteTargetWindow(): Promise<void> {
  pasteTargetWindowHandle = null
  if (process.platform !== 'win32' || !store.getState().settings.pasteAfterCopy) {
    return
  }

  try {
    debugPasteFlow('capture:start')
    const windowHandle = await sendPasteHelperCommand('capture', '', 500)
    pasteTargetWindowHandle = normalizePasteTargetWindowHandle(windowHandle)
    debugPasteFlow('capture:result', { windowHandle, pasteTargetWindowHandle })
  } catch (error) {
    debugPasteFlow('capture:error', { error: error instanceof Error ? error.message : String(error) })
    console.warn('Failed to capture paste target window.', error)
  }
}

async function sendPasteCommandToForegroundApp(): Promise<void> {
  const targetWindowHandle = pasteTargetWindowHandle
  pasteTargetWindowHandle = null

  try {
    debugPasteFlow('paste:start', { targetWindowHandle })
    await sendPasteHelperCommand('paste', targetWindowHandle ?? '', 1500)
    debugPasteFlow('paste:done', { targetWindowHandle })
  } catch (error) {
    debugPasteFlow('paste:error', { targetWindowHandle, error: error instanceof Error ? error.message : String(error) })
    console.warn('Failed to send paste command through the warm helper.', error)
    await runOneShotPasteHelper(targetWindowHandle).catch((fallbackError) => {
      debugPasteFlow('paste:fallback-error', {
        targetWindowHandle,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      })
      console.warn('Failed to paste into foreground app.', fallbackError)
    })
  }
}

async function ensurePasteHelperProcess(): Promise<void> {
  if (pasteHelperProcess && !pasteHelperProcess.killed && pasteHelperProcess.stdin.writable) {
    return
  }

  if (pasteHelperStartPromise) {
    return pasteHelperStartPromise
  }

  pasteHelperStartPromise = (async () => {
    const scriptPath = await ensurePasteHelperScript()
    if (pasteHelperProcess && !pasteHelperProcess.killed && pasteHelperProcess.stdin.writable) {
      return
    }
    pasteHelperStdoutBuffer = ''
    const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
    })
    pasteHelperProcess = helper
    helper.stdout.setEncoding('utf8')
    helper.stderr.setEncoding('utf8')
    helper.stdout.on('data', handlePasteHelperStdout)
    helper.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim()
      if (message) {
        debugPasteFlow('helper:stderr', { message })
        console.warn('LightClip paste helper stderr:', message)
      }
    })
    helper.once('error', (error) => {
      if (pasteHelperProcess === helper) {
        pasteHelperProcess = null
      }
      rejectPasteHelperRequests(error instanceof Error ? error : new Error(String(error)))
      console.warn('Failed to start LightClip paste helper.', error)
    })
    helper.once('exit', (code, signal) => {
      if (pasteHelperProcess === helper) {
        pasteHelperProcess = null
      }
      rejectPasteHelperRequests(new Error('Paste helper exited. code=' + (code ?? 'null') + ' signal=' + (signal ?? 'null')))
      if (!isQuitting && code !== 0) {
        console.warn('LightClip paste helper exited unexpectedly. code=' + (code ?? 'null') + ' signal=' + (signal ?? 'null'))
      }
    })
  })()

  try {
    await pasteHelperStartPromise
  } finally {
    pasteHelperStartPromise = null
  }
}

async function ensurePasteHelperScript(): Promise<string> {
  if (pasteHelperScriptPath) {
    return pasteHelperScriptPath
  }

  const helperDirectory = app.getPath('userData')
  const helperPath = join(helperDirectory, PASTE_HELPER_FILE_NAME)
  await mkdir(helperDirectory, { recursive: true })
  await writeFile(helperPath, PASTE_HELPER_SCRIPT, 'utf8')
  pasteHelperScriptPath = helperPath
  return helperPath
}

function stopPasteHelperProcess(): void {
  const helper = pasteHelperProcess
  pasteHelperProcess = null
  if (!helper) {
    return
  }

  if (helper.stdin.writable) {
    helper.stdin.end(String(++pasteHelperRequestId) + '|quit|\n')
  }

  const killTimer = setTimeout(() => {
    if (!helper.killed) {
      helper.kill()
    }
  }, 750)
  killTimer.unref()
}

async function runOneShotPasteHelper(targetWindowHandle: string | null): Promise<void> {
  const scriptPath = await ensurePasteHelperScript()
  await new Promise<void>((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
    if (targetWindowHandle) {
      args.push('-OnceTargetWindow', targetWindowHandle)
    }

    const helper = spawn('powershell.exe', args, {
      stdio: 'ignore',
      windowsHide: true,
    })
    const killTimer = setTimeout(() => {
      helper.kill()
      reject(new Error('Paste helper timed out'))
    }, 3500)
    killTimer.unref()

    helper.once('error', (error) => {
      clearTimeout(killTimer)
      reject(error)
    })
    helper.once('exit', (code) => {
      clearTimeout(killTimer)
      if (code && code !== 0) {
        reject(new Error('Paste helper exited with code ' + code))
        return
      }

      resolve()
    })
  })
}

async function sendPasteHelperCommand(command: 'capture' | 'paste', payload = '', timeoutMs = 1000): Promise<string> {
  await ensurePasteHelperProcess()
  const helper = pasteHelperProcess
  if (!helper || helper.killed || !helper.stdin.writable) {
    throw new Error('Paste helper is not running')
  }

  const requestId = ++pasteHelperRequestId
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pasteHelperRequests.delete(requestId)
      reject(new Error('Paste helper command timed out: ' + command))
    }, timeoutMs)
    timeout.unref()
    pasteHelperRequests.set(requestId, { resolve, reject, timeout })

    helper.stdin.write(String(requestId) + '|' + command + '|' + payload + '\n', (error) => {
      if (error) {
        clearTimeout(timeout)
        pasteHelperRequests.delete(requestId)
        reject(error)
      }
    })
  })
}

function handlePasteHelperStdout(chunk: string | Buffer): void {
  pasteHelperStdoutBuffer += chunk.toString()
  let lineBreakIndex = pasteHelperStdoutBuffer.indexOf('\n')
  while (lineBreakIndex >= 0) {
    const line = pasteHelperStdoutBuffer.slice(0, lineBreakIndex).trim()
    pasteHelperStdoutBuffer = pasteHelperStdoutBuffer.slice(lineBreakIndex + 1)
    handlePasteHelperLine(line)
    lineBreakIndex = pasteHelperStdoutBuffer.indexOf('\n')
  }
}

function handlePasteHelperLine(line: string): void {
  if (!line) {
    return
  }

  if (line === 'ready|ok|') {
    return
  }

  const [requestIdText, status, payload = ''] = line.split('|')
  const requestId = Number.parseInt(requestIdText, 10)
  const request = pasteHelperRequests.get(requestId)
  if (!request) {
    return
  }

  clearTimeout(request.timeout)
  pasteHelperRequests.delete(requestId)
  if (status === 'ok') {
    request.resolve(payload)
    return
  }

  request.reject(new Error(payload || 'Paste helper command failed'))
}

function rejectPasteHelperRequests(error: Error): void {
  for (const [requestId, request] of pasteHelperRequests) {
    clearTimeout(request.timeout)
    pasteHelperRequests.delete(requestId)
    request.reject(error)
  }
}

function isValidWindowHandle(value: string): boolean {
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) && trimmed !== '0'
}

function normalizePasteTargetWindowHandle(value: string): string | null {
  // The helper returns "top-level HWND;focused child HWND" so paste can restore both app and control focus.
  const targetSpec = value.trim()
  const [topLevelWindow] = targetSpec.split(';', 1)
  return isValidWindowHandle(topLevelWindow) ? targetSpec : null
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

function normalizeReleaseVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }

  return 0
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

ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (): Promise<CommandResult<UpdateCheckResult>> => {
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'LightClip',
      },
    })
    if (!response.ok) {
      return { ok: false, error: `检查更新失败：HTTP ${response.status}` }
    }

    const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown }
    const latestVersion = normalizeReleaseVersion(typeof release.tag_name === 'string' ? release.tag_name : '')
    const releaseUrl = typeof release.html_url === 'string' ? release.html_url : 'https://github.com/leaf-zly/lightclip/releases'
    if (!latestVersion) {
      return { ok: false, error: '未找到可用的最新版本号' }
    }

    const currentVersion = app.getVersion()
    return {
      ok: true,
      data: {
        currentVersion,
        latestVersion,
        updateAvailable: compareSemver(latestVersion, currentVersion) > 0,
        releaseUrl,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '检查更新失败' }
  }
})

ipcMain.handle(IPC_CHANNELS.openExternalUrl, async (_event, url: string): Promise<CommandResult> => {
  if (typeof url !== 'string' || !url.startsWith(RELEASE_URL_PREFIX)) {
    return { ok: false, error: '不允许打开该链接' }
  }

  await shell.openExternal(url)
  return { ok: true }
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
