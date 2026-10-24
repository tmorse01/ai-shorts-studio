import { readLayoutFile, writeLayoutFile } from '../layoutFile'
import { createProject, openProject } from '../project/projectStorage'
import { relinkMediaFolder } from '../media/relinkMedia'
import type { IpcHandlers } from './dispatch'

export interface IpcHandlerOptions {
  /** Where the editor layout is saved. The app passes a file in user data; tests pass a temp file. */
  layoutFile: string
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({ layoutFile }: IpcHandlerOptions): IpcHandlers {
  return {
    'app:echo': ({ text }) => ({ text, length: text.length }),
    'project:create': ({ folderPath, name }) => createProject(folderPath, name),
    'project:open': ({ folderPath }) => openProject(folderPath),
    'project:relinkFolder': ({ folderPath, searchFolder }) =>
      relinkMediaFolder(folderPath, searchFolder),
    'ui:layout:load': async () => ({ layout: await readLayoutFile(layoutFile) }),
    'ui:layout:save': async ({ layout }) => {
      await writeLayoutFile(layoutFile, layout)
      return { saved: true }
    }
  }
}
