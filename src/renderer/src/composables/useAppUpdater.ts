import type { Update } from '@tauri-apps/plugin-updater'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { calculateDownloadPercent, describeUpdaterError } from '../updater-utils'

/** Lifecycle states surfaced by the signed application updater. */
export type UpdaterStatus = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error'

/**
 * Coordinates signed Tauri update checks, download progress, installation, and relaunch.
 *
 * Startup checks are delayed and silent when no release is available. Interactive
 * checks always open the dialog so users receive an explicit result.
 */
export function useAppUpdater() {
  const status = ref<UpdaterStatus>('idle')
  const dialogOpen = ref(false)
  const update = shallowRef<Update | null>(null)
  const errorMessage = ref('')
  const downloadedBytes = ref(0)
  const totalBytes = ref<number>()
  const startupCheckKey = 'lightclip.last-update-check'
  const startupCheckIntervalMs = 6 * 60 * 60 * 1000
  let startupTimer: number | null = null

  const progressPercent = computed(() => calculateDownloadPercent(downloadedBytes.value, totalBytes.value))
  const isBusy = computed(() => status.value === 'checking' || status.value === 'downloading')

  /** Checks the configured signed update endpoint. */
  async function checkForUpdate(interactive = true): Promise<void> {
    if (isBusy.value || !('__TAURI_INTERNALS__' in window)) {
      return
    }
    status.value = 'checking'
    errorMessage.value = ''
    if (!interactive) {
      localStorage.setItem(startupCheckKey, String(Date.now()))
    }
    if (interactive) {
      dialogOpen.value = true
    }
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const nextUpdate = await check({ timeout: 3_000 })
      update.value = nextUpdate
      if (nextUpdate) {
        status.value = 'available'
        dialogOpen.value = true
      } else {
        status.value = 'current'
      }
    } catch (error) {
      status.value = 'error'
      errorMessage.value = describeUpdaterError(error)
      if (interactive) {
        dialogOpen.value = true
      }
    }
  }

  /** Downloads, verifies, installs, and relaunches into the selected release. */
  async function installUpdate(): Promise<void> {
    if (!update.value || isBusy.value) {
      return
    }
    status.value = 'downloading'
    downloadedBytes.value = 0
    totalBytes.value = undefined
    errorMessage.value = ''
    try {
      await update.value.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes.value = event.data.contentLength
        } else if (event.event === 'Progress') {
          downloadedBytes.value += event.data.chunkLength
        } else {
          status.value = 'ready'
        }
      })
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (error) {
      status.value = 'error'
      errorMessage.value = describeUpdaterError(error)
    }
  }

  /** Closes non-blocking updater states while preserving an active transfer. */
  function closeDialog(): void {
    if (!isBusy.value) {
      dialogOpen.value = false
    }
  }

  onMounted(() => {
    const lastCheck = Number(localStorage.getItem(startupCheckKey) ?? 0)
    if (Date.now() - lastCheck < startupCheckIntervalMs) {
      return
    }
    startupTimer = window.setTimeout(() => {
      void checkForUpdate(false)
    }, 2500)
  })

  onBeforeUnmount(() => {
    if (startupTimer !== null) {
      window.clearTimeout(startupTimer)
    }
    void update.value?.close()
  })

  return {
    status,
    dialogOpen,
    update,
    errorMessage,
    progressPercent,
    isBusy,
    checkForUpdate,
    installUpdate,
    closeDialog,
  }
}
