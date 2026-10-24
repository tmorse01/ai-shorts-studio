import type { IpcHandlers } from './dispatch'
import { createProject, openProject } from '../project/projectStorage'

// The main-process implementation of every channel. Input is already validated when a handler runs.
export const ipcHandlers: IpcHandlers = {
  'app:echo': ({ text }) => ({ text, length: text.length }),
  'project:create': ({ folderPath, name }) => createProject(folderPath, name),
  'project:open': ({ folderPath }) => openProject(folderPath)
}
