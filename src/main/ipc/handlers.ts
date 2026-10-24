import type { IpcHandlers } from './dispatch'
import { createProject, openProject, saveProject } from '../project/projectStorage'

// The main-process implementation of every channel. Input is already validated when a handler runs.
export const ipcHandlers: IpcHandlers = {
  'app:echo': ({ text }) => ({ text, length: text.length }),
  'project:create': ({ folderPath, name }) => createProject(folderPath, name),
  'project:open': ({ folderPath }) => openProject(folderPath),
  'project:save': async ({ folderPath, project }) => {
    await saveProject(folderPath, project)
    return { savedAt: new Date().toISOString() }
  }
}
