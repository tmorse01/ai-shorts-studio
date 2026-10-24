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
import { statMediaFiles } from '../media/statMedia'
import { ensureMediaThumbs } from '../media/ensureThumbs'
import { readThumbDataUrl } from '../media/readThumb'
import { ensureMediaProxies } from '../media/ensureProxies'
import type { IpcHandlers } from './dispatch'
import { logError } from '../errors/errorLog'
import { join } from 'node:path'
import { UserFacingError } from '../errors'
import { DEFAULT_PROJECTS_DIR, safeFolderName } from '@shared/project/folderName'
import { JobQueue, unavailableExecutors } from '../jobs/jobQueue'

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
  /** Shows the native multi-select picker for media files. Resolves an empty list on cancel. */
  pickMediaFiles: () => Promise<string[]>
}

const unavailable = (): never => {
  throw new UserFacingError('This action is not available here.')
}

export interface IpcHandlerOptions {
  /** Where the editor layout is saved. The app passes a file in user data; tests pass a temp file. */
  layoutFile: string
  /** Where the recent projects registry is saved. Same rule as layoutFile. */
  recentFile: string
  /** The media job queue. Defaults to one with no tools, so tests need not provide FFmpeg. */
  jobs?: JobQueue
  /** Native actions. Defaults refuse, so a caller that forgets them fails loudly. */
  system?: Partial<SystemActions>
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({
  layoutFile,
  recentFile,
  jobs = new JobQueue(unavailableExecutors()),
  system = {}
}: IpcHandlerOptions): IpcHandlers {
  const actions: SystemActions = {
    pickFolder: system.pickFolder ?? unavailable,
    revealFolder: system.revealFolder ?? unavailable,
    trashFolder: system.trashFolder ?? unavailable,
    documentsDir: system.documentsDir ?? unavailable,
    pickMediaFiles: system.pickMediaFiles ?? unavailable
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
    },
    'media:probe': ({ path }) => jobs.enqueue('probe', path).done,
    'media:job:list': () => ({ jobs: jobs.list() }),
    'media:job:cancel': ({ jobId }) => ({ cancelled: jobs.cancel(jobId) }),
    'media:pick': async () => ({ paths: await actions.pickMediaFiles() }),
    'media:stat': ({ paths }) => statMediaFiles(paths),
    'media:thumbs': ({ projectFolder, items }) => ensureMediaThumbs(projectFolder, items, jobs),
    'media:thumb:read': ({ projectFolder, mediaId, file }) =>
      readThumbDataUrl(projectFolder, mediaId, file),
    'media:proxy': ({ projectFolder, items }) => ensureMediaProxies(projectFolder, items, jobs)
  }
}
