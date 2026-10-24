import { readLayoutFile, writeLayoutFile } from '../layoutFile'
import { createProject, openProject, saveProject } from '../project/projectStorage'
import {
  listRecentProjects,
  locateRecentProject,
  recordRecentProject,
  removeRecentProject,
  renameRecentProject
} from '../project/recentProjects'
import { relinkMediaFolder } from '../media/relinkMedia'
import type { IpcHandlers } from './dispatch'
import { logError } from '../errors/errorLog'
import { join } from 'node:path'
import { UserFacingError } from '../errors'
import { DEFAULT_PROJECTS_DIR, safeFolderName } from '@shared/project/folderName'

// Operating-system features the handlers need. The app passes Electron versions; tests pass fakes,
// so this module never imports Electron.
export interface SystemActions {
  /** Shows the native folder picker. Resolves null when the user cancels. */
  pickFolder: () => Promise<string | null>
  /** Opens the folder's parent with the folder selected, in Explorer. */
  revealFolder: (folderPath: string) => void
  /** Moves a folder to the Recycle Bin. */
  trashFolder: (folderPath: string) => Promise<void>
  /** The user's Documents folder. */
  documentsDir: () => string
}

const unavailable = (): never => {
  throw new UserFacingError('This action is not available here.')
}

export interface IpcHandlerOptions {
  /** Where the editor layout is saved. The app passes a file in user data; tests pass a temp file. */
  layoutFile: string
  /** Where the recent projects registry is saved. Same rule as layoutFile. */
  recentFile: string
  /** Native actions. Defaults refuse, so a caller that forgets them fails loudly. */
  system?: Partial<SystemActions>
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({
  layoutFile,
  recentFile,
  system = {}
}: IpcHandlerOptions): IpcHandlers {
  const actions: SystemActions = {
    pickFolder: system.pickFolder ?? unavailable,
    revealFolder: system.revealFolder ?? unavailable,
    trashFolder: system.trashFolder ?? unavailable,
    documentsDir: system.documentsDir ?? unavailable
  }

  return {
    'app:echo': ({ text }) => ({ text, length: text.length }),
    'app:report-error': ({ message, details, context, stack }) => {
      logError({
        occurredAt: new Date().toISOString(),
        source: 'renderer',
        summary: details ? `${message} (${details})` : message,
        context,
        stack
      })
      return { logged: true }
    },
    'project:create': async ({ folderPath, name }) => {
      const opened = await createProject(folderPath, name)
      await recordRecentProject(recentFile, opened)
      return opened
    },
    'project:open': async ({ folderPath }) => {
      const opened = await openProject(folderPath)
      await recordRecentProject(recentFile, opened)
      return opened
    },
    'project:save': async ({ folderPath, project }) => {
      await saveProject(folderPath, project)
      return { savedAt: new Date().toISOString() }
    },
    'project:relinkFolder': ({ folderPath, searchFolder }) =>
      relinkMediaFolder(folderPath, searchFolder),
    'project:rename': async ({ folderPath, name }) => {
      const opened = await openProject(folderPath)
      await saveProject(folderPath, {
        ...opened.project,
        name,
        updatedAt: new Date().toISOString()
      })
      await renameRecentProject(recentFile, folderPath, name)
      return { name }
    },
    'project:defaultFolder': ({ name }) => ({
      folderPath: join(actions.documentsDir(), DEFAULT_PROJECTS_DIR, safeFolderName(name))
    }),
    'project:deleteFolder': async ({ folderPath }) => {
      await actions.trashFolder(folderPath)
      await removeRecentProject(recentFile, folderPath)
      return { deleted: true }
    },
    'folder:pick': async () => ({ folderPath: await actions.pickFolder() }),
    'folder:reveal': ({ folderPath }) => {
      actions.revealFolder(folderPath)
      return { revealed: true }
    },
    'recent:list': async () => ({ projects: await listRecentProjects(recentFile) }),
    'recent:remove': async ({ folderPath }) => {
      await removeRecentProject(recentFile, folderPath)
      return { removed: true }
    },
    'recent:locate': async ({ oldFolderPath, newFolderPath }) => {
      const opened = await openProject(newFolderPath)
      return { project: await locateRecentProject(recentFile, oldFolderPath, opened) }
    },
    'ui:layout:load': async () => ({ layout: await readLayoutFile(layoutFile) }),
    'ui:layout:save': async ({ layout }) => {
      await writeLayoutFile(layoutFile, layout)
      return { saved: true }
    }
  }
}
