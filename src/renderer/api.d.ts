import type { RendererApi } from '@shared/ipc'

// Typed by src/preload/index.ts through contextBridge.
declare global {
  interface Window {
    api: RendererApi & {
      /** The file system path of a file the user dropped into the window. */
      pathForFile: (file: File) => string
    }
  }
}

export {}
