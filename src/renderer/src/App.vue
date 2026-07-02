<script setup lang="ts">
import {
  Check,
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
  ListFilter,
  Minus,
  Moon,
  Pause,
  Pin,
  PinOff,
  Play,
  Power,
  RotateCcw,
  Search,
  Settings,
  Square,
  Sun,
  TimerReset,
  Trash2,
  Upload,
  X,
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import appIconUrl from '../../../resources/lightclip-icon.svg?url'
import type { AppSettings, AppState, AppThemeAccent, AppThemeMode, ClipboardItem, ClipboardItemKind } from '../../shared/types'
import { createItemTitle, describeItem, formatBytes, formatRelativeTime, matchesQuery } from './utils'

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

/**
 * History filters available in the list toolbar.
 */
interface HistoryFilterOption {
  /** Stable filter id used by renderer state. */
  id: 'all' | 'pinned' | ClipboardItemKind
  /** Human-readable toolbar label. */
  label: string
}

const DEFAULT_SHORTCUT = 'Alt+V'
const DEFAULT_PAUSE_MINUTES = 15
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
const historyFilters: readonly HistoryFilterOption[] = [
  { id: 'all', label: '全部' },
  { id: 'text', label: '文本' },
  { id: 'image', label: '图片' },
  { id: 'file', label: '文件' },
  { id: 'pinned', label: '固定' },
]

const state = ref<AppState>({
  items: [],
  storageBytes: 0,
  settings: {
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
    globalShortcut: DEFAULT_SHORTCUT,
    themeAccent: 'mint',
    themeMode: 'system',
  },
})
const query = ref('')
const activeFilter = ref<HistoryFilterOption['id']>('all')
const selectedIndex = ref(0)
const showSettings = ref(false)
const previewItem = ref<ClipboardItem | null>(null)
const toast = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const now = ref(Date.now())

let unsubscribeState: (() => void) | null = null
let clockTimer: number | null = null
let toastTimer: number | null = null

const filteredItems = computed(() =>
  state.value.items.filter((item) => {
    if (!matchesQuery(item, query.value)) {
      return false
    }

    if (activeFilter.value === 'all') {
      return true
    }

    if (activeFilter.value === 'pinned') {
      return item.pinned
    }

    return item.kind === activeFilter.value
  }),
)
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
const quickThemeLabel = computed(() => (state.value.settings.themeMode === 'dark' ? '切换浅色' : '切换暗黑'))
const shellClasses = computed(() => [
  `theme-${state.value.settings.themeAccent}`,
  `mode-${state.value.settings.themeMode}`,
])

/**
 * Loads initial app state and wires main-process updates into Vue state.
 */
onMounted(async () => {
  state.value = await window.lightClip.getState()
  unsubscribeState = window.lightClip.onStateChanged((nextState) => {
    state.value = nextState
  })
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 30_000)
  focusSearch()
})

onBeforeUnmount(() => {
  unsubscribeState?.()
  if (clockTimer) {
    window.clearInterval(clockTimer)
  }
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
})

watch([filteredItems, query, activeFilter], () => {
  selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, filteredItems.value.length - 1))
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
  const result = await window.lightClip.copyItem(item.id)
  showToast(result.ok ? '已复制到剪贴板' : result.error ?? '复制失败')
}

async function deleteItem(item: ClipboardItem): Promise<void> {
  const result = await window.lightClip.deleteItem(item.id)
  if (previewItem.value?.id === item.id) {
    previewItem.value = null
  }
  showToast(result.ok ? '已删除' : result.error ?? '删除失败')
}

async function togglePin(item: ClipboardItem): Promise<void> {
  const result = await window.lightClip.togglePin(item.id)
  showToast(result.ok ? (result.data?.pinned ? '已固定' : '已取消固定') : result.error ?? '操作失败')
}

async function clearHistory(): Promise<void> {
  const confirmed = window.confirm('清空所有未固定的剪贴板记录？')
  if (!confirmed) {
    return
  }

  const result = await window.lightClip.clearHistory()
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

  const result = await window.lightClip.clearByKind(kind)
  showToast(result.ok ? `已清理${getKindLabel(kind)}历史` : result.error ?? '清理失败')
}

async function exportHistory(): Promise<void> {
  const result = await window.lightClip.exportHistory()
  if (!result.ok) {
    showToast(result.error ?? '导出失败')
    return
  }

  if (result.data) {
    showToast(`已导出 ${result.data.itemCount} 条记录`)
  }
}

async function importHistory(): Promise<void> {
  const result = await window.lightClip.importHistory()
  if (!result.ok) {
    showToast(result.error ?? '导入失败')
    return
  }

  if (result.data) {
    showToast(`已导入 ${result.data.importedCount} 条记录`)
  }
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

async function toggleThemeMode(): Promise<void> {
  const nextMode: AppThemeMode = state.value.settings.themeMode === 'dark' ? 'light' : 'dark'
  await updateSettings({ themeMode: nextMode })
}

async function quitApp(): Promise<void> {
  await window.lightClip.quit()
}

async function minimizeWindow(): Promise<void> {
  await window.lightClip.minimizeWindow()
}

async function toggleMaximizeWindow(): Promise<void> {
  await window.lightClip.toggleMaximizeWindow()
}

async function closeWindow(): Promise<void> {
  await window.lightClip.closeWindow()
}

async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  const result = await window.lightClip.updateSettings(settings)
  if (!result.ok) {
    showToast(result.error ?? '设置保存失败')
  }
}

function moveSelection(delta: number): void {
  if (!filteredItems.value.length) {
    selectedIndex.value = 0
    return
  }

  const nextIndex = selectedIndex.value + delta
  selectedIndex.value = Math.min(filteredItems.value.length - 1, Math.max(0, nextIndex))
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
  previewItem.value = item
}

function closePreview(): void {
  previewItem.value = null
}

function filterCount(filter: HistoryFilterOption['id']): number {
  if (filter === 'all') {
    return state.value.items.length
  }

  if (filter === 'pinned') {
    return pinnedCount.value
  }

  return typeCounts.value[filter]
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

function handleKeyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (previewItem.value) {
      previewItem.value = null
    } else if (showSettings.value) {
      showSettings.value = false
    } else {
      window.lightClip.hidePanel()
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
        <img class="window-icon" :src="appIconUrl" alt="" />
        <span>LightClip</span>
      </div>
      <div class="window-controls">
        <button type="button" title="最小化" @click="minimizeWindow">
          <Minus :size="14" />
        </button>
        <button type="button" title="最大化/还原" @click="toggleMaximizeWindow">
          <Square :size="12" />
        </button>
        <button class="close" type="button" title="关闭到托盘" @click="closeWindow">
          <X :size="15" />
        </button>
      </div>
    </header>

    <section class="panel">
      <header class="topbar">
        <div class="brand" aria-label="LightClip">
          <div class="brand-mark">L</div>
          <div>
            <h1>LightClip</h1>
            <p>{{ captureStatus }} · {{ state.items.length }} 条历史 · {{ pinnedCount }} 条固定 · {{ storageLabel }}</p>
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
          <button class="icon-button" type="button" title="临时暂停 15 分钟" @click="pauseCapture()">
            <TimerReset :size="18" />
          </button>
          <button class="icon-button" type="button" :title="quickThemeLabel" @click="toggleThemeMode">
            <Sun v-if="state.settings.themeMode === 'dark'" :size="18" />
            <Moon v-else :size="18" />
          </button>
          <button class="icon-button" type="button" title="设置" @click="showSettings = !showSettings">
            <Settings :size="18" />
          </button>
          <button class="icon-button danger" type="button" title="退出 LightClip" @click="quitApp">
            <Power :size="18" />
          </button>
        </div>
      </header>

      <div class="search-row">
        <Search :size="20" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="搜索复制过的内容"
          autocomplete="off"
          spellcheck="false"
        />
        <button v-if="query" class="icon-button ghost" type="button" title="清空搜索" @click="query = ''">
          <X :size="18" />
        </button>
      </div>

      <div class="filter-row" aria-label="历史筛选">
        <ListFilter :size="17" />
        <div class="filter-tabs" role="tablist">
          <button
            v-for="filter in historyFilters"
            :key="filter.id"
            class="filter-tab"
            :class="{ selected: activeFilter === filter.id }"
            type="button"
            role="tab"
            :aria-selected="activeFilter === filter.id"
            @click="activeFilter = filter.id"
          >
            <span>{{ filter.label }}</span>
            <b>{{ filterCount(filter.id) }}</b>
          </button>
        </div>
      </div>

      <section v-if="showSettings" class="settings-pane" aria-label="设置">
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

        <div class="setting-row data-row">
          <div>
            <strong>数据管理</strong>
            <span>{{ storageLabel }} · 导出/导入本机 JSON 备份</span>
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

      <div class="list-toolbar">
        <span>{{ filteredItems.length }} 条匹配 · {{ activeFilterLabel }}</span>
        <div class="toolbar-actions">
          <button
            class="text-button"
            type="button"
            :disabled="!(activeFilter === 'text' || activeFilter === 'image' || activeFilter === 'file')"
            @click="clearActiveType"
          >
            <Eraser :size="16" />
            清理当前类型
          </button>
          <button class="text-button" type="button" :disabled="regularCount === 0" @click="clearHistory">
            <Trash2 :size="16" />
            清空未固定
          </button>
        </div>
      </div>

      <section v-if="filteredItems.length" class="history-list" aria-label="剪贴板历史">
        <article
          v-for="(item, index) in filteredItems"
          :key="item.id"
          class="history-item"
          :class="[`history-item-${item.kind}`, { selected: selectedIndex === index, pinned: item.pinned }]"
          @mouseenter="selectedIndex = index"
          @dblclick="copyItem(item)"
        >
          <button class="item-main" type="button" @click="copyItem(item)">
            <span v-if="item.kind === 'image'" class="image-item-layout">
              <span class="item-kind" :class="`kind-${item.kind}`">
                <Image :size="17" />
              </span>
              <span class="image-preview-frame">
                <img class="image-preview" :src="item.dataUrl" alt="" />
              </span>
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
                  <span class="item-preview">{{ createItemTitle(item) }}</span>
                </span>
              </span>
              <span class="item-meta">
                {{ describeItem(item) }} · {{ formatRelativeTime(item.updatedAt, now) }}
                <template v-if="item.copyCount"> · 已用 {{ item.copyCount }} 次</template>
              </span>
            </template>
          </button>

          <div class="item-actions">
            <button class="icon-button small" type="button" title="预览" @click.stop="openPreview(item)">
              <Eye :size="16" />
            </button>
            <button
              class="icon-button small"
              type="button"
              :title="item.pinned ? '取消固定' : '固定'"
              @click.stop="togglePin(item)"
            >
              <PinOff v-if="item.pinned" :size="16" />
              <Pin v-else :size="16" />
            </button>
            <button class="icon-button small" type="button" title="复制" @click.stop="copyItem(item)">
              <Copy :size="16" />
            </button>
            <button class="icon-button small danger" type="button" title="删除" @click.stop="deleteItem(item)">
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
    </section>

    <transition name="modal">
      <div v-if="previewItem" class="modal-backdrop" @click.self="closePreview">
          <section class="preview-modal" aria-label="历史预览">
            <header class="preview-header">
              <div>
                <strong>{{ createItemTitle(previewItem) }}</strong>
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
              <img v-if="previewItem.kind === 'image'" class="preview-image" :src="previewItem.dataUrl" alt="" />
              <pre v-else-if="previewItem.kind === 'text'" class="preview-text">{{ previewItem.text }}</pre>
              <div v-else class="preview-files">
                <div v-for="path in previewItem.paths" :key="path" class="preview-file-row">
                  <FolderOpen :size="16" />
                  <span>{{ getFileName(path) }}</span>
                  <small>{{ path }}</small>
                </div>
              </div>
            </div>

            <footer class="preview-actions">
              <button class="text-button primary" type="button" @click="copyItem(previewItem)">
                <Copy :size="16" />
                复制
              </button>
              <button class="text-button" type="button" @click="togglePin(previewItem)">
                <PinOff v-if="previewItem.pinned" :size="16" />
                <Pin v-else :size="16" />
                {{ previewItem.pinned ? '取消固定' : '固定' }}
              </button>
              <button class="text-button danger" type="button" @click="deleteItem(previewItem)">
                <Trash2 :size="16" />
                删除
              </button>
            </footer>
          </section>
      </div>
    </transition>

    <transition name="toast">
      <div v-if="toast" class="toast">
        <Check :size="16" />
        {{ toast }}
      </div>
    </transition>
  </main>
</template>
