<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, CheckCircle2, Clipboard, Download, ExternalLink, RefreshCw, RotateCw, ShieldCheck, X } from '@lucide/vue'
import { useAppUpdater } from '../composables/useAppUpdater'
import { getLightClipApi } from '../runtime'
import { parseReleaseNotes } from '../updater-utils'

const {
  status,
  dialogOpen,
  update,
  errorMessage,
  progressPercent,
  checkAttempt,
  checkAttemptTotal,
  isBusy,
  checkForUpdate,
  installUpdate,
  closeDialog,
} = useAppUpdater()
const lightClip = getLightClipApi()

const releasePageUrl = 'https://github.com/leaf-zly/lightclip/releases/latest'
const downloadUrl = computed(() => releasePageUrl)
const closeButton = ref<HTMLButtonElement | null>(null)
const copied = ref(false)
const releaseNotes = computed(() => parseReleaseNotes(update.value?.body))
const hasReleaseNotes = computed(() => releaseNotes.value.summary.length > 0 || releaseNotes.value.sections.length > 0)

watch(dialogOpen, async (open) => {
  copied.value = false
  if (open) {
    await nextTick()
    closeButton.value?.focus()
  }
})

/** Opens the release page when the signed updater cannot download an update. */
async function openReleasePage(): Promise<void> {
  await lightClip.openExternalUrl(downloadUrl.value)
}

/** Copies the current release download URL to the system clipboard. */
async function copyReleaseUrl(): Promise<void> {
  await navigator.clipboard?.writeText(downloadUrl.value)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

/** Closes the dialog with Escape when an update is not actively transferring. */
function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeDialog()
  }
}
</script>

<template>
  <button
    class="icon-button updater-trigger"
    :class="{ active: status === 'available' }"
    type="button"
    title="检查更新"
    @click="checkForUpdate(true)"
  >
    <RefreshCw :size="18" :class="{ spinning: status === 'checking' }" />
    <span v-if="status === 'available'" class="update-dot" aria-hidden="true"></span>
  </button>

  <Transition name="modal">
    <div v-if="dialogOpen" class="modal-backdrop updater-backdrop" @click.self="closeDialog">
      <section class="updater-dialog" role="dialog" aria-modal="true" aria-labelledby="updater-title" @keydown="handleDialogKeydown">
        <header class="updater-header">
          <div class="updater-heading">
            <span class="updater-logo" aria-hidden="true"><RefreshCw :size="17" /></span>
            <div>
              <strong id="updater-title">软件更新</strong>
              <span>LightClip</span>
            </div>
          </div>
          <button ref="closeButton" class="icon-button small" type="button" title="关闭" :disabled="isBusy" @click="closeDialog">
            <X :size="16" />
          </button>
        </header>

        <div class="updater-body" aria-live="polite">
          <div class="updater-status">
            <span class="updater-state-icon" :class="`is-${status}`" aria-hidden="true">
              <CheckCircle2 v-if="status === 'current'" :size="24" />
              <RotateCw v-else-if="status === 'checking'" :size="24" class="spinning" />
              <X v-else-if="status === 'error'" :size="24" />
              <Download v-else :size="24" />
            </span>
            <div>
              <strong v-if="update">发现新版本 v{{ update.version }}</strong>
              <strong v-else-if="status === 'current'">当前已是最新版本</strong>
              <strong v-else-if="status === 'error'">检查更新失败</strong>
              <strong v-else>正在检查更新</strong>
              <span v-if="update?.currentVersion">当前版本 v{{ update.currentVersion }}</span>
              <span v-else-if="status === 'checking'">
                正在连接更新服务<span v-if="checkAttemptTotal > 1">（第 {{ checkAttempt }}/{{ checkAttemptTotal }} 次）</span>
              </span>
              <span v-else-if="status === 'current'">暂时没有需要安装的内容</span>
              <span v-else-if="status === 'error'">可以重试或在浏览器中下载安装包</span>
            </div>
          </div>

          <div v-if="status === 'error'" class="updater-message is-error">{{ errorMessage }}</div>

          <div v-else-if="update && hasReleaseNotes" class="updater-notes">
            <p v-for="paragraph in releaseNotes.summary" :key="paragraph" class="updater-summary">{{ paragraph }}</p>
            <section v-for="section in releaseNotes.sections" :key="section.title" class="updater-notes-section">
              <h3>{{ section.title }}</h3>
              <ul>
                <li v-for="item in section.items" :key="item">{{ item }}</li>
              </ul>
            </section>
          </div>

          <div v-else-if="status === 'available'" class="updater-message">
            <ShieldCheck :size="17" />
            更新包会在安装前完成签名校验。
          </div>

          <div v-if="status === 'downloading'" class="update-progress" aria-label="更新下载进度">
            <span :style="{ width: progressPercent === null ? '28%' : `${progressPercent}%` }"></span>
          </div>
          <small v-if="status === 'downloading'" class="update-progress-label">
            {{ progressPercent === null ? '正在下载并验证' : `已下载 ${progressPercent}%` }}
          </small>
        </div>

        <footer class="updater-actions">
          <button v-if="status === 'available' || status === 'error'" class="text-button" type="button" @click="checkForUpdate(true)">
            <RefreshCw :size="15" />
            重新检查
          </button>
          <button v-if="status === 'error'" class="text-button" type="button" @click="copyReleaseUrl">
            <Check v-if="copied" :size="15" />
            <Clipboard v-else :size="15" />
            {{ copied ? '已复制' : '复制链接' }}
          </button>
          <button v-if="status === 'error'" class="text-button primary" type="button" @click="openReleasePage">
            <ExternalLink :size="15" />
            浏览器下载
          </button>
          <button v-if="status === 'available'" class="text-button primary" type="button" @click="installUpdate">
            <Download :size="15" />
            下载并安装
          </button>
          <button v-else-if="status === 'current'" class="text-button primary" type="button" @click="closeDialog">
            完成
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
