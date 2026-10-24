import { readLayoutFile, writeLayoutFile } from '../layoutFile'
import { createProject, openProject, saveProject } from '../project/projectStorage'
import {
  listRecentProjects,
  locateRecentProject,
  recordRecentProject,
  removeRecentProject
} from '../project/recentProjects'
import { relinkMediaFolder } from '../media/relinkMedia'
import type { IpcHandlers } from './dispatch'
import { logError } from '../errors/errorLog'
import { JobQueue, unavailableExecutors } from '../jobs/jobQueue'

export interface IpcHandlerOptions {
  /** Where the editor layout is saved. The app passes a file in user data; tests pass a temp file. */
  layoutFile: string
  /** Where the recent projects registry is saved. Same rule as layoutFile. */
  recentFile: string
  /** The media job queue. Defaults to one with no tools, so tests need not provide FFmpeg. */
  jobs?: JobQueue
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({
  layoutFile,
  recentFile,
  jobs = new JobQueue(unavailableExecutors())
}: IpcHandlerOptions): IpcHandlers {
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
    'media:job:cancel': ({ jobId }) => ({ cancelled: jobs.cancel(jobId) })
  }
}
