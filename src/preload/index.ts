import { contextBridge, ipcRenderer } from 'electron'
import { createBridge } from './bridge'

// The renderer gets one typed object, window.api. ipcRenderer itself is never exposed.
contextBridge.exposeInMainWorld(
  'api',
  createBridge((channel, input) => ipcRenderer.invoke(channel, input))
)
