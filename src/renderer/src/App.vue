<script setup lang="ts">
import {
  Check,
  ChevronDown,
  Copy,
  Eraser,
  FileStack,
  Image,
  Minus,
  Pause,
  Pin,
  PinOff,
  Play,
  Power,
  Search,
  Settings,
  Square,
  Trash2,
  X,
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import appIconUrl from '../../../resources/lightclip-icon.svg?url'
import type { AppSettings, AppState, ClipboardItem } from '../../shared/types'
import { createItemTitle, describeItem, formatRelativeTime, matchesQuery } from './utils'

const state = ref<AppState>({
  items: [],
  settings: {
    captureEnabled: true,
    launchAtLogin: false,
    maxHistoryItems: 300,
    minTextLength: 1,
    maxTextLength: 20000,
    captureImages: false,
    captureFiles: false,
    maxImageBytes: 5 * 1024 * 1024,
    maxFilePaths: 20,
    globalShortcut: 'Alt+V',
  },
})
const query = ref('')
const selectedIndex = ref(0)
const showSettings = ref(false)
const toast = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const now = ref(Date.now())

let unsubscribeState: (() => void) | null = null
let clockTimer: number | null = null
let toastTimer: number | null = null

const filteredItems = computed(() => state.value.items.filter((item) => matchesQuery(item, query.value)))
const selectedItem = computed(() => filteredItems.value[selectedIndex.value] ?? null)
const pinnedCount = computed(() => state.value.items.filter((item) => item.pinned).length)
const regularCount = computed(() => state.value.items.length - pinnedCount.value)
const captureStatus = computed(() => (state.value.settings.captureEnabled ? '正在记录' : '已暂停'))
const menus = [
  { id: 'file', label: '文件' },
  { id: 'edit', label: '编辑' },
  { id: 'view', label: '视图' },
  { id: 'window', label: '窗口' },
] as const

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

watch([filteredItems, query], () => {
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

async function quitApp(): Promise<void> {
  await window.lightClip.quit()
}

async function showMenu(menu: (typeof menus)[number]['id']): Promise<void> {
  await window.lightClip.showMenu(menu)
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

function handleKeyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (showSettings.value) {
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
  <main class="shell" @keydown="handleKeyboard">
    <header class="window-frame">
      <div class="window-title">
        <img class="window-icon" :src="appIconUrl" alt="" />
        <span>LightClip</span>
      </div>
      <nav class="window-menu" aria-label="应用菜单">
        <button v-for="menu in menus" :key="menu.id" type="button" @click="showMenu(menu.id)">
          {{ menu.label }}
        </button>
      </nav>
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
            <p>{{ captureStatus }} · {{ state.items.length }} 条历史 · {{ pinnedCount }} 条固定</p>
          </div>
        </div>

        <div class="top-actions">
          <button
            class="icon-button"
            :class="{ active: !state.settings.captureEnabled }"
            type="button"
            :title="state.settings.captureEnabled ? '暂停记录' : '恢复记录'"
            @click="updateSettings({ captureEnabled: !state.settings.captureEnabled })"
          >
            <Pause v-if="state.settings.captureEnabled" :size="18" />
            <Play v-else :size="18" />
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

      <section v-if="showSettings" class="settings-pane" aria-label="设置">
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
            <span>唤起快捷键</span>
            <input
              type="text"
              :value="state.settings.globalShortcut"
              @change="updateSettings({ globalShortcut: ($event.target as HTMLInputElement).value })"
            />
          </label>
        </div>
      </section>

      <div class="list-toolbar">
        <span>{{ filteredItems.length }} 条匹配</span>
        <button class="text-button" type="button" :disabled="regularCount === 0" @click="clearHistory">
          <Eraser :size="16" />
          清空未固定
        </button>
      </div>

      <section v-if="filteredItems.length" class="history-list" aria-label="剪贴板历史">
        <article
          v-for="(item, index) in filteredItems"
          :key="item.id"
          class="history-item"
          :class="{ selected: selectedIndex === index, pinned: item.pinned }"
          @mouseenter="selectedIndex = index"
          @dblclick="copyItem(item)"
        >
          <button class="item-main" type="button" @click="copyItem(item)">
            <span class="item-content">
              <span class="item-kind" :class="`kind-${item.kind}`">
                <Image v-if="item.kind === 'image'" :size="17" />
                <FileStack v-else-if="item.kind === 'file'" :size="17" />
                <Copy v-else :size="17" />
              </span>
              <span class="item-body">
                <img v-if="item.kind === 'image'" class="image-preview" :src="item.dataUrl" alt="" />
                <span v-else class="item-preview">{{ createItemTitle(item) }}</span>
              </span>
            </span>
            <span class="item-meta">
              {{ describeItem(item) }} · {{ formatRelativeTime(item.updatedAt, now) }}
              <template v-if="item.copyCount"> · 已用 {{ item.copyCount }} 次</template>
            </span>
          </button>

          <div class="item-actions">
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
        <p>{{ query ? '换个关键词，或者清空搜索。' : 'LightClip 会在后台保存文本剪贴板历史。' }}</p>
      </section>

      <footer class="footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 复制</span>
        <span><kbd>Esc</kbd> 隐藏</span>
      </footer>
    </section>

    <transition name="toast">
      <div v-if="toast" class="toast">
        <Check :size="16" />
        {{ toast }}
      </div>
    </transition>
  </main>
</template>
