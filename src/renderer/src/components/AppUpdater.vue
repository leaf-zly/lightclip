<script setup lang="ts">
import { CheckCircle2, Download, RefreshCw, RotateCw, X } from '@lucide/vue'
import { useAppUpdater } from '../composables/useAppUpdater'

const {
  status,
  dialogOpen,
  update,
  errorMessage,
  progressPercent,
  isBusy,
  checkForUpdate,
  installUpdate,
  closeDialog,
} = useAppUpdater()
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
        <section class="updater-dialog" role="dialog" aria-modal="true" aria-label="LightClip 更新">
          <header class="updater-header">
            <div>
              <strong>LightClip 更新</strong>
              <span v-if="update">发现新版本 v{{ update.version }}</span>
              <span v-else-if="status === 'current'">当前已经是最新版本</span>
              <span v-else-if="status === 'error'">检查更新失败</span>
              <span v-else>正在连接更新服务</span>
            </div>
            <button class="icon-button small" type="button" title="关闭" :disabled="isBusy" @click="closeDialog">
              <X :size="16" />
            </button>
          </header>

          <div class="updater-body">
            <CheckCircle2 v-if="status === 'current'" :size="30" class="updater-state-icon" />
            <RotateCw v-else-if="status === 'checking'" :size="30" class="updater-state-icon spinning" />
            <Download
              v-else-if="status === 'available' || status === 'downloading' || status === 'ready'"
              :size="30"
              class="updater-state-icon"
            />
            <p v-if="status === 'error'" class="updater-error">{{ errorMessage }}</p>
            <p v-else-if="update?.body" class="updater-notes">{{ update.body }}</p>
            <p v-else-if="status === 'available'">签名验证将在安装前自动完成。</p>
            <p v-else-if="status === 'current'">无需安装任何内容。</p>

            <div v-if="status === 'downloading'" class="update-progress" aria-label="更新下载进度">
              <span :style="{ width: progressPercent === null ? '28%' : `${progressPercent}%` }"></span>
            </div>
            <small v-if="status === 'downloading'">
              {{ progressPercent === null ? '正在下载并验证' : `已下载 ${progressPercent}%` }}
            </small>
          </div>

          <footer class="updater-actions">
            <button v-if="status === 'available' || status === 'error'" class="text-button" type="button" @click="checkForUpdate(true)">
              <RefreshCw :size="15" />
              重新检查
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
