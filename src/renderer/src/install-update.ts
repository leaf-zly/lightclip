import { Channel, invoke } from '@tauri-apps/api/core'
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'

/** Installing is emitted only after the native downloader verifies the release signature. */
export type InstallEvent = DownloadEvent | { event: 'Installing' }

/**
 * Hands a plugin-owned update resource to the checked Windows installer launcher.
 * Native code owns download verification and process exit; the renderer must not relaunch itself.
 * @param update Metadata returned by the signed updater check.
 * @param onEvent Receives download and verified-installation progress.
 * @returns Resolves after handoff, or rejects while retaining the app on failure.
 */
export async function installSignedUpdate(update: Update, onEvent: (event: InstallEvent) => void): Promise<void> {
  const channel = new Channel<InstallEvent>()
  channel.onmessage = onEvent
  await invoke('install_signed_update', { rid: update.rid, onEvent: channel })
}
