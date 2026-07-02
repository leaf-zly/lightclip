export type ClipboardItemKind = 'text' | 'image' | 'file'

/**
 * Accent palettes supported by LightClip's renderer theme system.
 */
export type AppThemeAccent = 'mint' | 'blue' | 'violet' | 'rose' | 'amber'

interface ClipboardItemBase {
  /** Stable generated identifier used by renderer operations. */
  id: string
  /** Optional source label reserved for future app-aware capture. */
  source?: string
  /** Whether the item is pinned above regular history and protected from bulk cleanup. */
  pinned: boolean
  /** Number of times the item has been copied back from LightClip. */
  copyCount: number
  /** Unix timestamp in milliseconds when the item was first recorded. */
  createdAt: number
  /** Unix timestamp in milliseconds when the item was last observed or copied. */
  updatedAt: number
}

/**
 * Plain text copied from the system clipboard.
 */
export interface TextClipboardItem extends ClipboardItemBase {
  kind: 'text'
  /** Plain text copied from the system clipboard. */
  text: string
}

/**
 * Image snapshot copied from the system clipboard.
 */
export interface ImageClipboardItem extends ClipboardItemBase {
  kind: 'image'
  /** PNG data URL used for preview and writing the image back to the clipboard. */
  dataUrl: string
  /** Image width in physical pixels. */
  width: number
  /** Image height in physical pixels. */
  height: number
  /** PNG byte size at capture time. */
  byteSize: number
}

/**
 * File path list copied from the system clipboard.
 */
export interface FileClipboardItem extends ClipboardItemBase {
  kind: 'file'
  /** Absolute file paths read from the clipboard. */
  paths: string[]
}

/**
 * Single clipboard history record persisted by the app.
 */
export type ClipboardItem = TextClipboardItem | ImageClipboardItem | FileClipboardItem

/**
 * User-configurable app settings shared between main and renderer processes.
 */
export interface AppSettings {
  /** Whether clipboard polling should add new records. */
  captureEnabled: boolean
  /** Whether LightClip should launch when the current user signs in. */
  launchAtLogin: boolean
  /** Maximum number of non-pinned items retained in the local store. */
  maxHistoryItems: number
  /** Minimum text length accepted by the capture pipeline. */
  minTextLength: number
  /** Maximum text length accepted by the capture pipeline. */
  maxTextLength: number
  /** Whether image clipboard snapshots should be stored locally. */
  captureImages: boolean
  /** Whether file path lists from the clipboard should be stored locally. */
  captureFiles: boolean
  /** Maximum image PNG payload size accepted by the capture pipeline. */
  maxImageBytes: number
  /** Maximum number of file paths accepted by the capture pipeline. */
  maxFilePaths: number
  /** Global shortcut used to show or hide the quick panel. */
  globalShortcut: string
  /** Accent color palette used by the window chrome and interactive states. */
  themeAccent: AppThemeAccent
}

/**
 * Complete snapshot delivered from the Electron main process to the renderer.
 */
export interface AppState {
  /** Persisted clipboard history, sorted with pinned and recent items first. */
  items: ClipboardItem[]
  /** Current application settings. */
  settings: AppSettings
}

/**
 * Result returned by mutating IPC commands.
 */
export interface CommandResult<T = undefined> {
  /** Whether the command succeeded. */
  ok: boolean
  /** Optional command payload. */
  data?: T
  /** User-safe error message when the command fails. */
  error?: string
}

/**
 * IPC channel names used by the preload bridge.
 */
export const IPC_CHANNELS = {
  getState: 'lightclip:get-state',
  copyItem: 'lightclip:copy-item',
  deleteItem: 'lightclip:delete-item',
  togglePin: 'lightclip:toggle-pin',
  clearHistory: 'lightclip:clear-history',
  updateSettings: 'lightclip:update-settings',
  minimizeWindow: 'lightclip:minimize-window',
  toggleMaximizeWindow: 'lightclip:toggle-maximize-window',
  closeWindow: 'lightclip:close-window',
  showPanel: 'lightclip:show-panel',
  hidePanel: 'lightclip:hide-panel',
  quit: 'lightclip:quit',
  stateChanged: 'lightclip:state-changed',
} as const

/**
 * Minimal API exposed to the renderer through Electron's context bridge.
 */
export interface LightClipApi {
  /** Reads the current persisted state from the main process. */
  getState: () => Promise<AppState>
  /** Copies a history item back to the OS clipboard. */
  copyItem: (id: string) => Promise<CommandResult<ClipboardItem>>
  /** Deletes one history item. */
  deleteItem: (id: string) => Promise<CommandResult>
  /** Toggles whether one item is pinned. */
  togglePin: (id: string) => Promise<CommandResult<ClipboardItem>>
  /** Deletes non-pinned records from history. */
  clearHistory: () => Promise<CommandResult>
  /** Persists a partial settings update. */
  updateSettings: (settings: Partial<AppSettings>) => Promise<CommandResult<AppSettings>>
  /** Minimizes the quick panel window. */
  minimizeWindow: () => Promise<void>
  /** Toggles the quick panel between maximized and restored states. */
  toggleMaximizeWindow: () => Promise<void>
  /** Closes the quick panel to the tray. */
  closeWindow: () => Promise<void>
  /** Hides the quick panel window. */
  hidePanel: () => Promise<void>
  /** Quits the background app process. */
  quit: () => Promise<void>
  /** Subscribes to state snapshots pushed from the main process. */
  onStateChanged: (callback: (state: AppState) => void) => () => void
}
