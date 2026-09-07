<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/** Image thumbnail with a delayed, viewport-constrained pointer preview. */
const props = defineProps<{
  /** Local clipboard image data URL; no remote resource is requested. */
  src: string
}>()
const anchor = ref<HTMLElement | null>(null)
const position = ref<{ left: string; top: string; width: string; height: string } | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

/** Removes the preview and transient listeners on scroll, blur, pointer exit or unmount. */
function close(): void {
  clearTimeout(timer)
  position.value = null
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
  window.removeEventListener('keydown', closeOnEscape)
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

/** Delays image decoding until hover settles and chooses the largest available vertical side. */
function schedule(event: PointerEvent): void {
  if (event.pointerType === 'touch') return
  close()
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
  window.addEventListener('keydown', closeOnEscape)
  timer = setTimeout(() => {
    const rect = anchor.value?.getBoundingClientRect()
    if (!rect) return
    const margin = 12
    const width = Math.min(340, innerWidth - margin * 2)
    const above = rect.top - margin * 2
    const below = innerHeight - rect.bottom - margin * 2
    const height = Math.min(260, Math.max(above, below))
    if (height < 64 || width < 64) return
    position.value = {
      left: `${Math.max(margin, Math.min(rect.left, innerWidth - width - margin))}px`,
      top: `${below >= above ? rect.bottom + margin : rect.top - margin - height}px`,
      width: `${width}px`, height: `${height}px`,
    }
  }, 250)
}

onBeforeUnmount(close)
</script>

<template>
  <span ref="anchor" class="image-preview-frame" @pointerenter="schedule" @pointerleave="close" @pointerdown="close">
    <img class="image-preview" :src="props.src" alt="" loading="lazy" decoding="async" />
    <!-- Kept outside content-visibility/list clipping, but inside the active theme scope. -->
    <Teleport v-if="position" to=".shell">
      <div class="image-hover-preview" role="tooltip" aria-label="图片预览" :style="position">
        <img :src="props.src" alt="图片预览" decoding="async" @error="close" />
      </div>
    </Teleport>
  </span>
</template>
