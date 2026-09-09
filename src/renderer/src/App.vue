<script setup lang="ts">
import {
  Check,
  ClipboardList,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Eclipse,
  Eraser,
  Eye,
  FileStack,
  FolderOpen,
  Image,
  LayoutList,
  Layers,
  Type,
  Minus,
  Ellipsis,
  Moon,
  Pause,
  Pin,
  PinOff,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Square,
  Sun,
  TimerReset,
  Trash2,
  Upload,
  Wrench,
  X,
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue'
import type {
  AppInterfaceMode,
  AppSettings,
  AppState,
  AppThemeAccent,
  AppThemeMode,
  ClipboardItem,
  ClipboardItemKind,
  HistoryItemUpsert,
  PasteStatusUpdate,
} from '../../shared/types'
import AppUpdater from './components/AppUpdater.vue'
import HistoryImage from './components/HistoryImage.vue'
import { getLightClipApi } from './runtime'
import { mergeHistoryUpdate } from './history'
import { containDialogFocus } from './dialog-focus'
import { createItemTitle, describeItem, formatBytes, formatRelativeTime } from './utils'
import { matchesAdvancedQuery, matchesTimeFilter, type HistoryTimeFilter } from './search'

/**
 * Theme accent metadata used to render the compact palette picker.
 */
interface ThemeAccentOption {
  /** Persisted accent identifier shared with the main process settings store. */
  id: AppThemeAccent
  /** Human-readable color name for accessibility and the current selection text. */
  label: string
  /** Primary swatch color shown in the settings panel. */
  color: string
}

/**
 * Appearance mode metadata used by the settings segmented control.
 */
interface ThemeModeOption {
  /** Persisted appearance identifier shared with the main process settings store. */
  id: AppThemeMode
  /** Human-readable label rendered in the settings panel. */
  label: string
}

/** Panel density option displayed in settings. */
interface InterfaceModeOption {
  /** Persisted layout identifier. */
  id: AppInterfaceMode
  /** Human-readable option label. */
  label: string
}

/** History filter displayed in the list toolbar. */
interface HistoryFilterOption {
  /** Stable filter id used by renderer state. */
  id: 'all' | 'pinned' | 'recent' | ClipboardItemKind
  /** Human-readable toolbar label. */
  label: string
  /** Lucide icon paired with an accessible label and hover tooltip. */
  icon: Component
}

const lightClip = getLightClipApi()
const DEFAULT_SHORTCUT = 'Alt+V'
const DEFAULT_PAUSE_MINUTES = 15
const INITIAL_RENDER_LIMIT = 60
const RENDER_LIMIT_STEP = 60
const themeAccents: readonly ThemeAccentOption[] = [
  { id: 'mint', label: '薄荷绿', color: '#20b486' },
  { id: 'blue', label: '湖蓝', color: '#3278d7' },
  { id: 'violet', label: '紫罗兰', color: '#7c5cff' },
  { id: 'rose', label: '玫瑰红', color: '#d94b78' },
  { id: 'amber', label: '琥珀黄', color: '#c9861f' },
]
const themeModes: readonly ThemeModeOption[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '暗黑' },
]
const interfaceModes: readonly InterfaceModeOption[] = [
  { id: 'standard', label: '标准' },
  { id: 'compact', label: '简略' },
]
const historyFilters: readonly HistoryFilterOption[] = [
  { id: 'all', label: '全部', icon: Layers },
  { id: 'text', label: '文本', icon: Type },
  { id: 'image', label: '图片', icon: Image },
  { id: 'file', label: '文件', icon: FolderOpen },
  { id: 'pinned', label: '片段', icon: Pin },
  { id: 'recent', label: '最近使用', icon: Clock },
]

const state = shallowRef<AppState>({
  items: [],
  storageBytes: 0,
  storageDirectory: '',
  storageFilePath: '',
  storageCompression: 'brotli',
  storageEncrypted: false,
  encryptionAvailable: false,
  settings: {
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
    globalShortcut: DEFAULT_SHORTCUT,
    themeAccent: 'mint',
    themeMode: 'system',
    interfaceMode: 'standard',
    sensitiveContentProtection: false,
    sensitiveKeywords: [],
    maxStorageBytes: 256 * 1024 * 1024,
    automaticBackups: true,
    backupIntervalHours: 24,
    backupKeepCount: 7,
  },
})
const query = ref('')
const queryInput = ref('')
const activeFilter = ref<HistoryFilterOption['id']>('all')
const timeFilter = ref<HistoryTimeFilter>('all')
const selectedIndex = ref(0)
const visibleLimit = ref(INITIAL_RENDER_LIMIT)
const showSettings = ref(false)
const quickActions = ref<HTMLElement | null>(null)
const updater = ref<InstanceType<typeof AppUpdater> | null>(null)
const previewItem = ref<ClipboardItem | null>(null)
const previewDialog = ref<HTMLElement | null>(null)
const imageZoom = ref(1)
const imagePan = ref({ x: 0, y: 0 })
const imageDragging = ref(false)
const imageDragStart = ref({ x: 0, y: 0 })
const imagePanStart = ref({ x: 0, y: 0 })
let previewPreviousFocus: HTMLElement | null = null
const toast = ref('')
const copyInFlight = ref(false)
const itemMutation = ref<{ id: string; action: 'pin' | 'delete' } | null>(null)
const itemActionBusy = computed(() => copyInFlight.value || itemMutation.value !== null)
const pasteStatus = ref<PasteStatusUpdate['status'] | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const now = ref(Date.now())

let unsubscribeState: (() => void) | null = null
let unsubscribeHistoryItem: (() => void) | null = null
let unsubscribePasteStatus: (() => void) | null = null
let clockTimer: number | null = null
let toastTimer: number | null = null
let searchTimer: number | null = null

// Vue preserves this computed value when a settings-only response retains the
// same items array, so changing appearance does not invalidate history searches.
const historyItems = computed(() => state.value.items)
const filteredItems = computed(() =>
  historyItems.value.filter((item) => {
    if (!matchesAdvancedQuery(item, query.value, now.value) || !matchesTimeFilter(item, timeFilter.value, now.value)) {
      return false
    }

    if (activeFilter.value === 'all') {
      return true
    }

    if (activeFilter.value === 'pinned') {
      return item.pinned
    }

    if (activeFilter.value === 'recent') {
      return item.copyCount > 0
    }

    return item.kind === activeFilter.value
  }),
)
const visibleItems = computed(() => filteredItems.value.slice(0, visibleLimit.value))
const selectedItem = computed(() => filteredItems.value[selectedIndex.value] ?? null)
const pinnedCount = computed(() => state.value.items.filter((item) => item.pinned).length)
const regularCount = computed(() => state.value.items.length - pinnedCount.value)
const typeCounts = computed<Record<ClipboardItemKind, number>>(() => ({
  text: state.value.items.filter((item) => item.kind === 'text').length,
  image: state.value.items.filter((item) => item.kind === 'image').length,
  file: state.value.items.filter((item) => item.kind === 'file').length,
}))
const capturePausedUntil = computed(() => state.value.settings.capturePausedUntil)
const captureIsTemporarilyPaused = computed(() => Boolean(capturePausedUntil.value && capturePausedUntil.value > now.value))
const captureStatus = computed(() => {
  if (!state.value.settings.captureEnabled) {
    return '已暂停'
  }

  if (captureIsTemporarilyPaused.value && capturePausedUntil.value) {
    return `暂停到 ${formatClock(capturePausedUntil.value)}`
  }

  return '正在记录'
})
const currentThemeLabel = computed(
  () => themeAccents.find((accent) => accent.id === state.value.settings.themeAccent)?.label ?? themeAccents[0].label,
)
const currentThemeModeLabel = computed(
  () => themeModes.find((mode) => mode.id === state.value.settings.themeMode)?.label ?? themeModes[0].label,
)
const activeFilterLabel = computed(
  () => historyFilters.find((filter) => filter.id === activeFilter.value)?.label ?? historyFilters[0].label,
)
const storageLabel = computed(() => formatBytes(state.value.storageBytes))
const storageCompressionLabel = computed(() => {
  if (state.value.storageCompression === 'safeStorageBrotli') {
    return '系统加密 + Brotli'
  }

  return state.value.storageCompression === 'brotli' ? 'Brotli 压缩' : '未压缩'
})
const storagePathLabel = computed(() => state.value.storageFilePath || '默认数据目录')
const quickInterfaceLabel = computed(() =>
  state.value.settings.interfaceMode === 'compact' ? '切换标准模式' : '切换简略模式',
)
const quickThemeLabel = computed(() => (state.value.settings.themeMode === 'dark' ? '切换浅色' : '切换暗黑'))
const shellClasses = computed(() => [
  `theme-${state.value.settings.themeAccent}`,
  `mode-${state.value.settings.themeMode}`,
  `interface-${state.value.settings.interfaceMode}`,
])

/**
 * Loads initial app state and wires main-process updates into Vue state.
 */
onMounted(async () => {
  state.value = await lightClip.getState()
  unsubscribeState = lightClip.onStateChanged((nextState) => {
    state.value = nextState
  })
  unsubscribeHistoryItem = lightClip.onHistoryItemUpserted?.(applyHistoryItemUpsert) ?? null
  unsubscribePasteStatus = lightClip.onPasteStatus?.((update) => {
    pasteStatus.value = update.status
    if (update.message) {
      showToast(update.message)
    }
  }) ?? null
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 30_000)
  focusSearch()
})

onBeforeUnmount(() => {
  unsubscribeState?.()
  unsubscribeHistoryItem?.()
  unsubscribePasteStatus?.()
  if (clockTimer) {
    window.clearInterval(clockTimer)
  }
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }
})

/**
 * Merges one persisted history record without replacing the complete multi-megabyte state snapshot.
 *
 * @param update Canonical record and compressed store size emitted by the Tauri host.
 */
function applyHistoryItemUpsert(update: HistoryItemUpsert): void {
  const items = mergeHistoryUpdate(state.value.items, update)
  state.value = {
    ...state.value,
    items,
    storageBytes: update.storageBytes,
  }
}

watch([query, activeFilter, timeFilter], () => {
  visibleLimit.value = INITIAL_RENDER_LIMIT
  selectedIndex.value = 0
})

watch(filteredItems, () => {
  // Incremental capture and clock updates must not collapse an already-scrolled list.
  selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, filteredItems.value.length - 1))
})

/**
 * Commits search text after a short idle period so large histories do not
 * re-render once for every keystroke.
 */
watch(queryInput, (value) => {
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }
  searchTimer = window.setTimeout(() => {
    query.value = value
    searchTimer = null
  }, 80)
})

async function focusSearch(): Promise<void> {
  await nextTick()
  searchInput.value?.focus()
}

async function copySelectedItem(): Promise<void> {
  if (!selectedItem.value) {
    return
  }
  await copyItem(selectedItem.value)
}

async function copyItem(item: ClipboardItem): Promise<void> {
  if (itemActionBusy.value) return
  copyInFlight.value = true
  try {
    const result = await lightClip.copyItem(item.id)
    if (!result.ok) showToast(result.error ?? '复制失败')
  } catch {
    showToast('复制失败，请重试')
  } finally {
    copyInFlight.value = false
  }
}

async function deleteItem(item: ClipboardItem): Promise<void> {
  if (itemActionBusy.value) return
  itemMutation.value = { id: item.id, action: 'delete' }
  try {
    const result = await lightClip.deleteItem(item.id)
    if (result.ok) {
      // The native command returns metadata, not a multi-megabyte history snapshot.
      state.value = { ...state.value, items: state.value.items.filter((entry) => entry.id !== item.id),
        storageBytes: result.data?.storageBytes ?? state.value.storageBytes }
      if (previewItem.value?.id === item.id) closePreview()
    }
    showToast(result.ok ? '已删除' : result.error ?? '删除失败')
  } catch {
    showToast('删除失败，请重试')
  } finally {
    itemMutation.value = null
  }
}

async function togglePin(item: ClipboardItem): Promise<void> {
  if (itemActionBusy.value) return
  itemMutation.value = { id: item.id, action: 'pin' }
  try {
    const result = await lightClip.togglePin(item.id)
    if (result.ok && result.data) {
      // Apply the acknowledged native state immediately; pin persistence is now
      // metadata-only, but the list must not wait for a full history refresh.
      state.value = {
        ...state.value,
        items: state.value.items.map((entry) => entry.id === item.id ? result.data! : entry),
        storageBytes: state.value.storageBytes,
      }
      if (previewItem.value?.id === item.id) previewItem.value = result.data
    }
    showToast(result.ok ? (result.data?.pinned ? '已固定' : '已取消固定') : result.error ?? '操作失败')
  } catch {
    showToast('操作失败，请重试')
  } finally {
    itemMutation.value = null
  }
}

/** Full plain-text hover label for truncated records; image previews use their own surface. */
function itemHoverText(item: ClipboardItem): string {
  return item.kind === 'text' ? item.text : item.kind === 'file' ? item.paths.join('\n') : describeItem(item)
}

async function clearHistory(): Promise<void> {
  const confirmed = window.confirm('清空所有未固定的剪贴板记录？')
  if (!confirmed) {
    return
  }

  const result = await lightClip.clearHistory()
  showToast(result.ok ? '已清空未固定记录' : result.error ?? '清空失败')
}

async function clearActiveType(): Promise<void> {
  const kind = activeFilter.value
  if (kind !== 'text' && kind !== 'image' && kind !== 'file') {
    return
  }

  const confirmed = window.confirm(`清空所有未固定的${getKindLabel(kind)}历史？`)
  if (!confirmed) {
    return
  }

  const result = await lightClip.clearByKind(kind)
  showToast(result.ok ? `已清理${getKindLabel(kind)}历史` : result.error ?? '清理失败')
}

async function exportHistory(): Promise<void> {
  const result = await lightClip.exportHistory()
  if (!result.ok) {
    showToast(result.error ?? '导出失败')
    return
  }

  if (result.data) {
    showToast(`已导出 ${result.data.itemCount} 条记录`)
  }
}

async function importHistory(): Promise<void> {
  const result = await lightClip.importHistory()
  if (!result.ok) {
    showToast(result.error ?? '导入失败')
    return
  }

  if (result.data) {
    showToast(`已导入 ${result.data.importedCount} 条记录`)
  }
}

async function checkForUpdates(): Promise<void> {
  await updater.value?.checkForUpdate(true)
}

async function openStorageDirectory(): Promise<void> {
  const result = await lightClip.openStorageDirectory()
  showToast(result.ok ? '已打开存储目录' : result.error ?? '打开失败')
}

async function selectStorageDirectory(): Promise<void> {
  const result = await lightClip.selectStorageDirectory()
  if (!result.ok) {
    showToast(result.error ?? '切换失败')
    return
  }

  if (result.data) {
    showToast('已切换存储位置')
  }
}

async function resetStorageDirectory(): Promise<void> {
  const result = await lightClip.resetStorageDirectory()
  showToast(result.ok ? '已恢复默认存储位置' : result.error ?? '恢复失败')
}

async function pauseCapture(minutes = DEFAULT_PAUSE_MINUTES): Promise<void> {
  await updateSettings({ capturePausedUntil: Date.now() + minutes * 60_000 })
  showToast(`已暂停记录 ${minutes} 分钟`)
}

async function resumeCapture(): Promise<void> {
  await updateSettings({ captureEnabled: true, capturePausedUntil: null })
  showToast('已恢复记录')
}

async function toggleCapture(): Promise<void> {
  if (captureIsTemporarilyPaused.value) {
    await resumeCapture()
    return
  }

  const nextEnabled = !state.value.settings.captureEnabled
  await updateSettings({ captureEnabled: nextEnabled, capturePausedUntil: nextEnabled ? null : state.value.settings.capturePausedUntil })
}

async function resetShortcut(): Promise<void> {
  await updateSettings({ globalShortcut: DEFAULT_SHORTCUT })
  showToast('已重置快捷键')
}

/** Switches between standard and compact panel layouts without reopening the app. */
async function toggleInterfaceMode(): Promise<void> {
  const interfaceMode: AppInterfaceMode = state.value.settings.interfaceMode === 'compact' ? 'standard' : 'compact'
  await updateSettings({ interfaceMode })
}

async function toggleThemeMode(): Promise<void> {
  const nextMode: AppThemeMode = state.value.settings.themeMode === 'dark' ? 'light' : 'dark'
  await updateSettings({ themeMode: nextMode })
}

async function quitApp(): Promise<void> {
  await lightClip.quit()
}

async function minimizeWindow(): Promise<void> {
  await lightClip.minimizeWindow()
}

async function toggleMaximizeWindow(): Promise<void> {
  await lightClip.toggleMaximizeWindow()
}

async function closeWindow(): Promise<void> {
  await lightClip.closeWindow()
}

let settingsQueue: Promise<void> = Promise.resolve()
let settingsRevision = 0

/** Applies appearance immediately and serializes persistence to prevent stale mode replies. */
async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  const revision = ++settingsRevision
  const shouldApplyOptimisticSettings = isVisualSettingsUpdate(settings)
  if (shouldApplyOptimisticSettings) {
    // Apply visual settings in the renderer first; persistence must never block a layout repaint.
    state.value = {
      ...state.value,
      settings: {
        ...state.value.settings,
        ...settings,
      },
    }
  }

  const request = settingsQueue.then(() => lightClip.updateSettings(settings))
  settingsQueue = request.then(() => undefined, () => undefined)
  const result = await request.catch(() => ({ ok: false, error: '设置保存失败' } as const))
  // A newer local choice owns the visible state while older writes finish.
  if (revision !== settingsRevision) return
  if (!result.ok) {
    showToast(result.error ?? '设置保存失败')
    state.value = await lightClip.getState()
    return
  }

  // Keep only the canonical settings from the response. Replacing the whole state
  // here would make a mode toggle redraw every history item again.
  if (result.data) {
    state.value = {
      ...state.value,
      settings: result.data,
    }
  }
}

/** Returns whether a settings patch can be reflected locally before native persistence completes. */
function isVisualSettingsUpdate(settings: Partial<AppSettings>): boolean {
  return Boolean(settings.themeAccent || settings.themeMode || settings.interfaceMode)
}

function moveSelection(delta: number): void {
  if (!filteredItems.value.length) {
    selectedIndex.value = 0
    return
  }

  const nextIndex = selectedIndex.value + delta
  selectedIndex.value = Math.min(filteredItems.value.length - 1, Math.max(0, nextIndex))
  ensureVisibleLimitIncludes(selectedIndex.value)
  void nextTick(() => document.querySelector('.history-item.selected')?.scrollIntoView({ block: 'nearest' }))
}

function ensureVisibleLimitIncludes(index: number): void {
  if (index >= visibleLimit.value - 8) {
    visibleLimit.value = Math.min(filteredItems.value.length, visibleLimit.value + RENDER_LIMIT_STEP)
  }
}

function handleHistoryScroll(event: Event): void {
  const element = event.currentTarget as HTMLElement
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
  if (remaining < 220 && visibleLimit.value < filteredItems.value.length) {
    visibleLimit.value = Math.min(filteredItems.value.length, visibleLimit.value + RENDER_LIMIT_STEP)
  }
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 1800)
}

function openPreview(item: ClipboardItem): void {
  previewPreviousFocus = document.activeElement as HTMLElement | null
  previewItem.value = item
  resetImageView()
  void nextTick(() => previewDialog.value?.focus())
}

function closePreview(): void {
  previewItem.value = null
  resetImageView()
  if (previewPreviousFocus?.isConnected) previewPreviousFocus.focus()
}

/** Restores the image viewer to its readable default scale and centered position. */
function resetImageView(): void {
  imageZoom.value = 1
  imagePan.value = { x: 0, y: 0 }
  imageDragging.value = false
}

/** Adjusts image scale around the cursor without allowing runaway zoom values. */
function zoomImage(event: WheelEvent): void {
  if (previewItem.value?.kind !== 'image') return
  event.preventDefault()
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
  imageZoom.value = Math.min(5, Math.max(0.5, imageZoom.value * factor))
}

/** Begins panning the enlarged image with the primary mouse button. */
function startImagePan(event: PointerEvent): void {
  if (event.button !== 0 || previewItem.value?.kind !== 'image') return
  imageDragging.value = true
  imageDragStart.value = { x: event.clientX, y: event.clientY }
  imagePanStart.value = { ...imagePan.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

/** Moves the image while the pointer is captured by the viewer. */
function moveImagePan(event: PointerEvent): void {
  if (!imageDragging.value) return
  imagePan.value = {
    x: imagePanStart.value.x + event.clientX - imageDragStart.value.x,
    y: imagePanStart.value.y + event.clientY - imageDragStart.value.y,
  }
}

/** Ends a pointer pan without affecting the modal focus trap. */
function stopImagePan(event: PointerEvent): void {
  imageDragging.value = false
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
}

/** Double-click is a fast reset for users who have zoomed deeply into an image. */
function resetImageOnDoubleClick(): void {
  resetImageView()
}

function filterCount(filter: HistoryFilterOption['id']): number {
  if (filter === 'all') {
    return state.value.items.length
  }

  if (filter === 'pinned') {
    return pinnedCount.value
  }

  if (filter === 'recent') {
    return state.value.items.filter((item) => item.copyCount > 0).length
  }

  return typeCounts.value[filter]
}

function updateSensitiveKeywords(value: string): void {
  const sensitiveKeywords = Array.from(
    new Set(
      value
        .split(/[，,;；\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  )
  updateSettings({ sensitiveKeywords })
}

async function optimizeStorage(): Promise<void> {
  if (!lightClip.optimizeStorage) {
    showToast('当前运行模式暂不支持存储整理')
    return
  }
  const result = await lightClip.optimizeStorage()
  if (!result.ok || !result.data) {
    showToast(result.error ?? '存储整理失败')
    return
  }
  const savedBytes = Math.max(0, result.data.beforeBytes - result.data.afterBytes)
  showToast('已移除 ' + result.data.removedItems + ' 条，释放 ' + formatBytes(savedBytes))
}

function updateExcludedAppNames(value: string): void {
  const excludedAppNames = Array.from(
    new Set(
      value
        .split(/[，,;；\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  )
  updateSettings({ excludedAppNames })
}

function getKindLabel(kind: ClipboardItemKind): string {
  return kind === 'image' ? '图片' : kind === 'file' ? '文件' : '文本'
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

/** Moves focus and selection within the filter group without triggering history shortcuts. */
function handleFilterKeyboard(event: KeyboardEvent): void {
  event.stopPropagation()
  const index = historyFilters.findIndex((filter) => filter.id === activeFilter.value)
  let nextIndex: number
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % historyFilters.length
  else if (event.key === 'ArrowLeft') nextIndex = (index + historyFilters.length - 1) % historyFilters.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = historyFilters.length - 1
  else return
  event.preventDefault()
  activeFilter.value = historyFilters[nextIndex].id
  const group = event.currentTarget as HTMLElement
  group.querySelectorAll<HTMLButtonElement>('.filter-tab')[nextIndex]?.focus()
}

function handleKeyboard(event: KeyboardEvent): void {
  if (event.isComposing || event.defaultPrevented) return
  // Form controls own their keystrokes; Enter there must not copy history.
  if (showSettings.value || previewItem.value || (event.target instanceof HTMLElement && event.target.closest('button, select, textarea, [contenteditable="true"]'))) {
    if (event.key === 'Escape') {
      if (previewItem.value) closePreview()
      else if (showSettings.value) showSettings.value = false
    }
    return
  }
  if (event.ctrlKey && !event.altKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
    const item = filteredItems.value[Number(event.key) - 1]
    if (item) {
      event.preventDefault()
      void copyItem(item)
    }
    return
  }

  if (event.key === 'Escape') {
    if (previewItem.value) {
      previewItem.value = null
    } else if (showSettings.value) {
      showSettings.value = false
    } else {
      lightClip.hidePanel()
    }
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSelection(1)
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(-1)
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    copySelectedItem()
  }
}
</script>

<template>
  <main class="shell" :class="shellClasses" @keydown="handleKeyboard">
    <header class="window-frame">
      <div class="window-title">
        <span class="window-icon" aria-hidden="true"><ClipboardList :size="17" :stroke-width="1.7" /></span>
        <span>LightClip</span>
      </div>
      <div class="window-controls">
        <button class="compact-more" type="button" title="更多操作" aria-label="更多操作" popovertarget="quick-actions">
          <Ellipsis :size="18" />
        </button>
        <button type="button" title="最小化" @click="minimizeWindow">
          <Minus :size="14" />
        </button>
        <button class="maximize-control" type="button" title="最大化/还原" @click="toggleMaximizeWindow">
          <Square :size="12" />
        </button>
        <button class="close" type="button" title="关闭到托盘" @click="closeWindow">
          <X :size="15" />
        </button>
      </div>
    </header>

    <div id="quick-actions" ref="quickActions" class="quick-actions" popover="auto" role="group" aria-label="更多操作" @keydown.stop @click="quickActions?.hidePopover()">
      <span class="quick-actions-status">{{ captureStatus }}</span>
      <button type="button" @click="toggleCapture">
        <Pause v-if="state.settings.captureEnabled && !captureIsTemporarilyPaused" :size="16" /><Play v-else :size="16" />
        {{ state.settings.captureEnabled && !captureIsTemporarilyPaused ? '暂停记录' : '恢复记录' }}
      </button>
      <button type="button" @click="toggleInterfaceMode"><LayoutList :size="16" />{{ quickInterfaceLabel }}</button>
      <button type="button" @click="toggleThemeMode"><Eclipse :size="16" />{{ quickThemeLabel }}</button>
      <button type="button" @click="updater?.checkForUpdate(true)"><RefreshCw :size="16" />检查更新</button>
      <button type="button" @click="showSettings = !showSettings"><Settings :size="16" />{{ showSettings ? '返回历史' : '设置' }}</button>
    </div>
    <AppUpdater ref="updater" hide-trigger />

    <section class="panel">
      <header class="topbar">
        <div class="brand" aria-label="LightClip">
          <span class="brand-mark" aria-hidden="true"><ClipboardList :size="24" :stroke-width="1.7" /></span>
          <div>
            <h1>LightClip</h1>
            <p>{{ captureStatus }} · {{ state.items.length }} 条历史 · {{ pinnedCount }} 条片段 · {{ storageLabel }}</p>
          </div>
        </div>

        <div class="top-actions">
          <button
            class="icon-button"
            :class="{ active: !state.settings.captureEnabled || captureIsTemporarilyPaused }"
            type="button"
            :title="state.settings.captureEnabled ? '暂停记录' : '恢复记录'"
            @click="toggleCapture"
          >
            <Pause v-if="state.settings.captureEnabled" :size="18" />
            <Play v-else :size="18" />
          </button>
          <button class="icon-button secondary-action" type="button" title="临时暂停 15 分钟" @click="pauseCapture()">
            <TimerReset :size="18" />
          </button>
          <button class="icon-button" type="button" :title="quickInterfaceLabel" @click="toggleInterfaceMode">
            <LayoutList :size="18" />
          </button>
          <button class="icon-button" type="button" :title="quickThemeLabel" @click="toggleThemeMode">
            <Sun v-if="state.settings.themeMode === 'dark'" :size="18" />
            <Moon v-else :size="18" />
          </button>
          <button class="icon-button" type="button" title="检查更新" @click="updater?.checkForUpdate(true)"><RefreshCw :size="18" /></button>
          <button class="icon-button" :class="{ active: showSettings }" :aria-pressed="showSettings" type="button" title="设置" @click="showSettings = !showSettings">
            <Settings :size="18" />
          </button>
          <button class="icon-button danger secondary-action" type="button" title="退出 LightClip" @click="quitApp">
            <Power :size="18" />
          </button>
        </div>
      </header>

      <div v-if="!showSettings" class="search-row">
        <Search :size="20" />
        <input
          ref="searchInput"
          v-model="queryInput"
          type="search"
          placeholder="搜索历史内容"
          autocomplete="off"
          spellcheck="false"
        />
          <button v-if="queryInput" class="icon-button ghost" type="button" title="清空搜索" @click="queryInput = ''">
          <X :size="18" />
        </button>
      </div>

      <div v-if="!showSettings" class="filter-row" aria-label="历史筛选">
        <div class="filter-tabs" role="group" aria-label="内容类型" @keydown="handleFilterKeyboard">
          <button
            v-for="filter in historyFilters"
            :key="filter.id"
            class="filter-tab"
            :class="{ selected: activeFilter === filter.id }"
            type="button"
            :aria-label="`${filter.label}，${filterCount(filter.id)} 条`"
            :aria-pressed="activeFilter === filter.id"
            :aria-describedby="`filter-tip-${filter.id}`"
            :tabindex="activeFilter === filter.id ? 0 : -1"
            @click="activeFilter = filter.id"
          >
            <component :is="filter.icon" :size="18" :stroke-width="1.7" aria-hidden="true" />
            <span :id="`filter-tip-${filter.id}`" class="filter-tooltip" role="tooltip">{{ filter.label }} · {{ filterCount(filter.id) }} 条</span>
          </button>
        </div>
        <select v-model="timeFilter" class="filter-select" title="时间范围" aria-label="时间范围">
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="week">近 7 天</option>
          <option value="month">近 30 天</option>
        </select>
      </div>

      <section v-if="showSettings" class="settings-pane settings-pane-expanded" aria-label="设置">
        <div class="setting-row mode-setting">
          <div>
            <strong>界面模式</strong>
            <span>标准面板或类似 Win+V 的紧凑面板</span>
          </div>
          <div class="segmented-control" role="radiogroup" aria-label="界面模式">
            <button
              v-for="mode in interfaceModes"
              :key="mode.id"
              class="segment-button"
              :class="{ selected: state.settings.interfaceMode === mode.id }"
              type="button"
              role="radio"
              :aria-checked="state.settings.interfaceMode === mode.id"
              @click="updateSettings({ interfaceMode: mode.id })"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>

        <div class="setting-row mode-setting">
          <div>
            <strong>外观</strong>
            <span>{{ currentThemeModeLabel }}</span>
          </div>
          <div class="segmented-control" role="radiogroup" aria-label="外观模式">
            <button
              v-for="mode in themeModes"
              :key="mode.id"
              class="segment-button"
              :class="{ selected: state.settings.themeMode === mode.id }"
              type="button"
              role="radio"
              :aria-checked="state.settings.themeMode === mode.id"
              :title="mode.label"
              @click="updateSettings({ themeMode: mode.id })"
            >
              <Eclipse v-if="mode.id === 'system'" :size="15" />
              <Sun v-else-if="mode.id === 'light'" :size="15" />
              <Moon v-else :size="15" />
              <span>{{ mode.label }}</span>
            </button>
          </div>
        </div>

        <div class="setting-row theme-setting">
          <div>
            <strong>主题色</strong>
            <span>{{ currentThemeLabel }}</span>
          </div>
          <div class="theme-swatches" role="radiogroup" aria-label="主题色">
            <button
              v-for="accent in themeAccents"
              :key="accent.id"
              class="theme-swatch"
              :class="{ selected: state.settings.themeAccent === accent.id }"
              :style="{ '--swatch-color': accent.color }"
              type="button"
              role="radio"
              :aria-checked="state.settings.themeAccent === accent.id"
              :aria-label="accent.label"
              :title="accent.label"
              @click="updateSettings({ themeAccent: accent.id })"
            ></button>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <strong>开机自启</strong>
            <span>登录 Windows 后自动在后台启动</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="state.settings.launchAtLogin"
              @change="updateSettings({ launchAtLogin: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <strong>图片历史</strong>
            <span>保存截图和图片剪贴板，默认关闭以控制体积</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="state.settings.captureImages"
              @change="updateSettings({ captureImages: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <strong>文件历史</strong>
            <span>记录文件路径列表，复制回去时优先恢复为 Windows 文件剪贴板</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="state.settings.captureFiles"
              @change="updateSettings({ captureFiles: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <strong>敏感内容保护</strong>
            <span>跳过可能包含密码、验证码、令牌或银行卡号的文本</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="state.settings.sensitiveContentProtection"
              @change="updateSettings({ sensitiveContentProtection: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <strong>自动备份</strong>
            <span>在存储目录保留定时滚动备份</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="state.settings.automaticBackups"
              @change="updateSettings({ automaticBackups: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <strong>本地加密</strong>
            <span>{{ state.encryptionAvailable ? '使用 Windows 账户级加密保护本机存储' : '当前系统暂不可用' }}</span>
          </div>
          <label class="switch" :class="{ disabled: !state.encryptionAvailable }">
            <input
              type="checkbox"
              :checked="state.settings.encryptStore"
              :disabled="!state.encryptionAvailable"
              @change="updateSettings({ encryptStore: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <strong>复制后粘贴</strong>
            <span>选择历史后自动粘贴到前台应用</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="state.settings.pasteAfterCopy"
              @change="updateSettings({ pasteAfterCopy: ($event.target as HTMLInputElement).checked })"
            />
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="setting-row exclusion-row">
          <div>
            <strong>排除应用</strong>
            <span>这些进程在前台时不记录剪贴板</span>
          </div>
          <input
            class="setting-text-input"
            type="text"
            :value="state.settings.excludedAppNames.join(', ')"
            placeholder="Bitwarden, KeePass, 1Password"
            @change="updateExcludedAppNames(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="setting-row exclusion-row">
          <div>
            <strong>敏感关键词</strong>
            <span>命中任一关键词的文本不会进入历史</span>
          </div>
          <input
            class="setting-text-input"
            type="text"
            :value="state.settings.sensitiveKeywords.join(', ')"
            placeholder="私钥, access token"
            @change="updateSensitiveKeywords(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="setting-row data-row">
          <div>
            <strong>数据管理</strong>
            <span>{{ storageLabel }} · {{ storageCompressionLabel }} · 导出/导入本机 JSON 备份</span>
          </div>
          <div class="setting-actions">
            <button class="text-button" type="button" title="导出历史" @click="exportHistory">
              <Download :size="16" />
              导出
            </button>
            <button class="text-button" type="button" title="导入历史" @click="importHistory">
              <Upload :size="16" />
              导入
            </button>
            <button class="text-button" type="button" title="整理存储" @click="optimizeStorage">
              <Wrench :size="16" />
              整理
            </button>
            <button class="text-button" type="button" title="检查更新" @click="checkForUpdates">
              <RefreshCw :size="16" />
              更新
            </button>
          </div>
        </div>

        <div class="setting-row storage-row">
          <div>
            <strong>存储位置</strong>
            <span class="storage-path" :title="state.storageFilePath">{{ storagePathLabel }}</span>
          </div>
          <div class="setting-actions">
            <button class="text-button" type="button" title="打开存储目录" @click="openStorageDirectory">
              <FolderOpen :size="16" />
              打开
            </button>
            <button class="text-button" type="button" title="更改存储目录" @click="selectStorageDirectory">
              <FolderOpen :size="16" />
              更改
            </button>
            <button class="text-button" type="button" title="恢复默认目录" @click="resetStorageDirectory">
              <RotateCcw :size="16" />
              默认
            </button>
          </div>
        </div>

        <div class="setting-grid">
          <label>
            <span>历史上限</span>
            <input
              type="number"
              min="20"
              max="3000"
              :value="state.settings.maxHistoryItems"
              @change="updateSettings({ maxHistoryItems: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label>
            <span>保留天数</span>
            <input
              type="number"
              min="0"
              max="3650"
              :value="state.settings.retentionDays"
              @change="updateSettings({ retentionDays: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label>
            <span>最大文本长度</span>
            <input
              type="number"
              min="100"
              max="200000"
              :value="state.settings.maxTextLength"
              @change="updateSettings({ maxTextLength: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label>
            <span>最大图片体积</span>
            <input
              type="number"
              min="128"
              max="102400"
              :value="Math.round(state.settings.maxImageBytes / 1024)"
              @change="updateSettings({ maxImageBytes: Number(($event.target as HTMLInputElement).value) * 1024 })"
            />
          </label>
          <label>
            <span>最大文件数量</span>
            <input
              type="number"
              min="1"
              max="200"
              :value="state.settings.maxFilePaths"
              @change="updateSettings({ maxFilePaths: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label>
            <span>存储上限 (MB)</span>
            <input
              type="number"
              min="0"
              max="2048"
              :value="Math.round(state.settings.maxStorageBytes / 1024 / 1024)"
              @change="updateSettings({ maxStorageBytes: Number(($event.target as HTMLInputElement).value) * 1024 * 1024 })"
            />
          </label>
          <label>
            <span>备份间隔 (小时)</span>
            <input
              type="number"
              min="1"
              max="720"
              :value="state.settings.backupIntervalHours"
              @change="updateSettings({ backupIntervalHours: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label>
            <span>备份保留数量</span>
            <input
              type="number"
              min="1"
              max="30"
              :value="state.settings.backupKeepCount"
              @change="updateSettings({ backupKeepCount: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label>
            <span>唤起快捷键</span>
            <span class="inline-input-action">
              <input
                type="text"
                :value="state.settings.globalShortcut"
                @change="updateSettings({ globalShortcut: ($event.target as HTMLInputElement).value })"
              />
              <button class="icon-button small" type="button" title="重置快捷键" @click="resetShortcut">
                <RotateCcw :size="15" />
              </button>
            </span>
          </label>
        </div>
      </section>

      <template v-else>
        <div class="list-toolbar">
          <span>{{ filteredItems.length }} 条匹配 · {{ activeFilterLabel }}</span>
          <div class="toolbar-actions">
            <button
              class="text-button"
              type="button"
              title="清理当前类型"
              :disabled="!(activeFilter === 'text' || activeFilter === 'image' || activeFilter === 'file')"
              @click="clearActiveType"
            >
              <Eraser :size="16" />
              <span class="action-label">清理当前类型</span>
            </button>
            <button class="text-button" type="button" title="清空未固定" :disabled="regularCount === 0" @click="clearHistory">
              <Trash2 :size="16" />
              <span class="action-label">清空未固定</span>
            </button>
          </div>
        </div>

        <section v-if="filteredItems.length" class="history-list" aria-label="剪贴板历史" @scroll="handleHistoryScroll">
          <article
            v-for="(item, index) in visibleItems"
            :key="item.id"
            class="history-item"
            :class="[`history-item-${item.kind}`, { selected: selectedIndex === index, pinned: item.pinned }]"
            @mouseenter="selectedIndex = index"
          >
            <button class="item-main" type="button" :disabled="itemActionBusy" @click="copyItem(item)">
              <span v-if="item.kind === 'image'" class="image-item-layout">
                <span class="item-kind" :class="`kind-${item.kind}`">
                  <Image :size="17" />
                </span>
                <HistoryImage :src="item.dataUrl" />
                <span class="image-item-copy">
                  <span class="item-preview">{{ createItemTitle(item) }}</span>
                  <span class="item-meta">
                    {{ describeItem(item) }} · {{ formatRelativeTime(item.updatedAt, now) }}
                    <template v-if="item.copyCount"> · 已用 {{ item.copyCount }} 次</template>
                  </span>
                </span>
              </span>

              <template v-else>
                <span class="item-content">
                  <span class="item-kind" :class="`kind-${item.kind}`">
                    <FileStack v-if="item.kind === 'file'" :size="17" />
                    <Copy v-else :size="17" />
                  </span>
                  <span class="item-body">
                    <span class="item-preview" :title="itemHoverText(item)">{{ createItemTitle(item) }}</span>
                  </span>
                </span>
                <span class="item-meta">
                  {{ describeItem(item) }} · {{ formatRelativeTime(item.updatedAt, now) }}
                  <template v-if="item.copyCount"> · 已用 {{ item.copyCount }} 次</template>
                </span>
              </template>
            </button>

            <button class="icon-button small compact-preview" type="button" title="预览和操作" @click.stop="openPreview(item)"><Ellipsis :size="16" /></button>
            <div class="item-actions">
              <button class="icon-button small" type="button" title="预览" @click.stop="openPreview(item)">
                <Eye :size="16" />
              </button>
              <button
                class="icon-button small"
                type="button"
                :title="item.pinned ? '取消固定' : '固定'"
                :disabled="itemActionBusy"
                @click.stop="togglePin(item)"
              >
                <PinOff v-if="item.pinned" :size="16" />
                <Pin v-else :size="16" />
              </button>
              <button class="icon-button small" type="button" title="复制" :disabled="itemActionBusy" @click.stop="copyItem(item)">
                <Copy :size="16" />
              </button>
              <button class="icon-button small danger" type="button" title="删除" :disabled="itemActionBusy" @click.stop="deleteItem(item)">
                <Trash2 :size="16" />
              </button>
            </div>
          </article>
        </section>

        <section v-else class="empty-state">
          <div class="empty-icon">
            <ChevronDown :size="28" />
          </div>
          <h2>{{ query ? '没有匹配结果' : '复制一点内容试试' }}</h2>
          <p>{{ query ? '换个关键词，或者切换筛选。' : 'LightClip 会在后台保存文本剪贴板历史。' }}</p>
        </section>

        <footer class="footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 复制</span>
          <span><kbd>Esc</kbd> 隐藏</span>
        </footer>
      </template>
    </section>

    <transition name="modal">
      <div v-if="previewItem" class="modal-backdrop" @click.self="closePreview">
          <section ref="previewDialog" tabindex="-1" class="preview-modal" role="dialog" aria-modal="true" aria-label="历史预览" @keydown="containDialogFocus" @keydown.esc="closePreview">
            <header class="preview-header">
              <div>
                <strong :title="itemHoverText(previewItem)">{{ createItemTitle(previewItem) }}</strong>
                <span>
                  {{ getKindLabel(previewItem.kind) }} · {{ describeItem(previewItem) }} ·
                  <Clock :size="13" /> {{ formatRelativeTime(previewItem.updatedAt, now) }}
                </span>
              </div>
              <button class="icon-button small" type="button" title="关闭预览" @click="closePreview">
                <X :size="16" />
              </button>
            </header>

            <div class="preview-body" :class="`preview-body-${previewItem.kind}`">
              <div
                v-if="previewItem.kind === 'image'"
                class="preview-image-viewport"
                :class="{ dragging: imageDragging }"
                role="img"
                aria-label="图片预览，可滚轮缩放并拖动"
                @wheel="zoomImage"
                @pointerdown="startImagePan"
                @pointermove="moveImagePan"
                @pointerup="stopImagePan"
                @pointercancel="stopImagePan"
                @dblclick="resetImageOnDoubleClick"
              >
                <img
                  class="preview-image"
                  :src="previewItem.dataUrl"
                  alt=""
                  decoding="async"
                  :style="{ transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})` }"
                />
                <span class="image-zoom-hint">滚轮缩放 · 拖动查看 · 双击重置</span>
                <span class="image-zoom-level">{{ Math.round(imageZoom * 100) }}%</span>
              </div>
              <pre v-else-if="previewItem.kind === 'text'" class="preview-text">{{ previewItem.text }}</pre>
              <div v-else class="preview-files">
                <div v-for="path in previewItem.paths" :key="path" class="preview-file-row">
                  <FolderOpen :size="16" />
                  <span :title="path">{{ getFileName(path) }}</span>
                  <small :title="path">{{ path }}</small>
                </div>
              </div>
            </div>

            <footer class="preview-actions" :aria-busy="itemActionBusy">
              <button class="text-button primary" type="button" :disabled="itemActionBusy" @click="copyItem(previewItem)">
                <Copy :size="16" />
                {{ copyInFlight ? '复制中…' : '复制' }}
              </button>
              <button class="text-button" type="button" :disabled="itemActionBusy" @click="togglePin(previewItem)">
                <PinOff v-if="previewItem.pinned" :size="16" />
                <Pin v-else :size="16" />
                {{ itemMutation?.action === 'pin' ? '保存中…' : previewItem.pinned ? '取消固定' : '固定' }}
              </button>
              <button class="text-button danger" type="button" :disabled="itemActionBusy" @click="deleteItem(previewItem)">
                <Trash2 :size="16" />
                {{ itemMutation?.action === 'delete' ? '删除中…' : '删除' }}
              </button>
            </footer>
          </section>
      </div>
    </transition>

    <transition name="toast">
      <div v-if="pasteStatus === 'started'" class="toast paste-toast">正在粘贴…</div>
      <div v-else-if="toast" class="toast">
        <Check :size="16" />
        {{ toast }}
      </div>
    </transition>
  </main>
</template>
