import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ShortcutEvent } from '@tauri-apps/plugin-global-shortcut'
import type {
  AppSettings,
  AppState,
  ClipboardItem,
  ClipboardItemKind,
  CommandResult,
  HistoryExportResult,
  HistoryImportResult,
  LightClipApi,
  StorageLocationResult,
  UpdateCheckResult,
} from '../../shared/types'

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown
}

/**
 * Returns the runtime bridge used by the renderer regardless of whether the
 * app is hosted by Electron 1.x or Tauri 2.x.
 *
 * Electron injects `window.lightClip` from preload. Tauri has no preload
 * bridge, so we map the same API contract onto typed Rust commands.
 */
export function getLightClipApi(): LightClipApi {
  if (window.lightClip) {
    return window.lightClip
  }

  if (!isTauriRuntime()) {
    throw new Error('LightClip runtime bridge is unavailable.')
  }

  return tauriLightClipApi
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in (window as TauriWindow)
}

const tauriLightClipApi: LightClipApi = {
  getState: () => invoke<AppState>('get_state'),
  copyItem: (id) => invoke<CommandResult<ClipboardItem>>('copy_item', { id }),
  deleteItem: (id) => invoke<CommandResult>('delete_item', { id }),
  togglePin: (id) => invoke<CommandResult<ClipboardItem>>('toggle_pin', { id }),
  clearHistory: () => invoke<CommandResult>('clear_history'),
  clearByKind: (kind: ClipboardItemKind) => invoke<CommandResult>('clear_by_kind', { kind }),
  exportHistory: exportTauriHistory,
  importHistory: importTauriHistory,
  checkForUpdates: () => invoke<CommandResult<UpdateCheckResult>>('check_for_updates'),
  openExternalUrl: (url) => invoke<CommandResult>('open_external_url', { url }),
  selectStorageDirectory: selectTauriStorageDirectory,
  resetStorageDirectory: () => invoke<CommandResult<StorageLocationResult>>('reset_storage_directory'),
  openStorageDirectory: () => invoke<CommandResult>('open_storage_directory'),
  updateSettings: (settings: Partial<AppSettings>) => invoke<CommandResult<AppSettings>>('update_settings', { settings }),
  minimizeWindow: () => invoke<void>('minimize_window'),
  toggleMaximizeWindow: () => invoke<void>('toggle_maximize_window'),
  closeWindow: () => invoke<void>('close_window'),
  hidePanel: () => invoke<void>('hide_panel'),
  quit: () => invoke<void>('quit_app'),
  onStateChanged: (callback) => {
    let unlisten: (() => void) | null = null
    let disposed = false

    void listen<AppState>('state-changed', (event) => {
      callback(event.payload)
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten()
        return
      }

      unlisten = nextUnlisten
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  },
}

async function exportTauriHistory(): Promise<CommandResult<HistoryExportResult>> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const filePath = await save({
    title: '导出 LightClip 历史',
    filters: [{ name: 'LightClip History', extensions: ['json'] }],
  })
  if (!filePath) {
    return { ok: true }
  }

  return invoke<CommandResult<HistoryExportResult>>('export_history_to_path', { filePath })
}

async function importTauriHistory(): Promise<CommandResult<HistoryImportResult>> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const filePath = await open({
    title: '导入 LightClip 历史',
    filters: [{ name: 'LightClip History', extensions: ['json'] }],
  })
  if (!filePath || Array.isArray(filePath)) {
    return { ok: true }
  }

  return invoke<CommandResult<HistoryImportResult>>('import_history_from_path', { filePath })
}

async function selectTauriStorageDirectory(): Promise<CommandResult<StorageLocationResult>> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const directory = await open({
    title: '选择 LightClip 存储目录',
    directory: true,
  })
  if (!directory || Array.isArray(directory)) {
    return { ok: true }
  }

  return invoke<CommandResult<StorageLocationResult>>('move_storage_directory', { directory })
}

let activeRuntimeShortcut = ''

/**
 * Registers the Tauri global shortcut from renderer state.
 *
 * Electron keeps global-shortcut ownership in the main process, so this is a
 * no-op there. Tauri's plugin API is loaded dynamically to avoid touching
 * native plugin code while the renderer is hosted by Electron.
 */
export async function configureRuntimeGlobalShortcut(shortcut: string): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  const normalizedShortcut = shortcut.trim()
  if (!normalizedShortcut || normalizedShortcut === activeRuntimeShortcut) {
    return
  }

  const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut')
  await unregisterAll()
  await register(normalizedShortcut, handleRuntimeShortcut)
  activeRuntimeShortcut = normalizedShortcut
}

function handleRuntimeShortcut(event: ShortcutEvent): void {
  if (event.state !== 'Pressed') {
    return
  }

  void invoke('toggle_panel')
}
