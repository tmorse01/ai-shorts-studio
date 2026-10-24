import type { IpcHandlers } from './dispatch'

// The main-process implementation of every channel. Input is already validated when a handler runs.
export const ipcHandlers: IpcHandlers = {
  'app:echo': ({ text }) => ({ text, length: text.length })
}
