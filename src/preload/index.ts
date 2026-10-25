import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createBridge, createEventBridge } from './bridge'
import { E2E_RENDERER_ARG } from '../shared/e2e/previewHook'

// The renderer gets one typed object, window.api. ipcRenderer itself is never exposed.
contextBridge.exposeInMainWorld('api', {
  ...createBridge((channel, input) => ipcRenderer.invoke(channel, input)),
  on: createEventBridge((channel, listener) => {
    const wrapped = (_event: unknown, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  }),
  // Dropped files carry no path in a sandboxed renderer, so the bridge reads it for them.
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  // True only in E2E runs (AISS_E2E=1). The preview reads it to publish its test hook.
  e2eMode: process.argv.includes(E2E_RENDERER_ARG)
})
