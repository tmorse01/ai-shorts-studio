import type { RendererApi } from '@shared/ipc'
import type { E2eHook } from '@shared/e2e/previewHook'

// Typed by src/preload/index.ts through contextBridge.
declare global {
  interface Window {
    api: RendererApi & {
      /** The file system path of a file the user dropped into the window. */
      pathForFile: (file: File) => string
      /** True only in E2E runs (AISS_E2E=1). */
      e2eMode: boolean
    }
    /** The E2E test hook. Set by the preview only in E2E runs. */
    __aissE2E?: E2eHook
  }
}

export {}
