/// <reference types="vite/client" />

import type { LightClipApi } from '../../shared/types'

declare global {
  interface Window {
    /** Electron preload bridge used by the Vue renderer. */
    lightClip: LightClipApi
  }
}
