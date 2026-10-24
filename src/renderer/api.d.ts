import type { RendererApi } from '@shared/ipc'

// Typed by src/preload/index.ts through contextBridge.
declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
