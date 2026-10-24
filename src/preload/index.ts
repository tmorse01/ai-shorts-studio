import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createBridge, createEventBridge } from './bridge'

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
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
})
