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
import { ensureShortPosters } from '../media/ensurePosters'
import { readPosterDataUrl } from '../media/posters'
import { ensureMediaProxies } from '../media/ensureProxies'
import { MediaSourceRegistry, describeMediaSources } from '../media/mediaSources'
import type { IpcHandlers } from './dispatch'
import { logError } from '../errors/errorLog'
import { join } from 'node:path'
import { UserFacingError } from '../errors'
import { DEFAULT_PROJECTS_DIR, safeFolderName } from '@shared/project/folderName'
import { JobQueue, unavailableExecutors } from '../jobs/jobQueue'
import {
  AnalysisService,
  type AnalysisStorage,
  type AnalysisChange
} from '../analysis/analysisService'
import { loadAnalysisFile, saveAnalysisFile } from '../analysis/analysisFile'
import { readMediaTranscript } from '../analysis/transcriptRead'
import { readMediaVision } from '../analysis/visionRead'
import { AiService } from '../ai/aiService'
import { memoryAiStateStorage } from '../ai/aiStateFile'
import { unavailableSecretStore } from '../ai/secretStore'
import { createAnthropicClient } from '../ai/anthropicClient'

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
  /** Where analysis records are kept. Defaults to the analysis file in each project folder. */
  analysisStorage?: AnalysisStorage
  /** Told whenever a project's analysis records change. The app forwards it to the renderer. */
  onAnalysisChanged?: (change: AnalysisChange) => void
  /** Where media:sources records each item's files for the media protocol. Shared with the protocol. */
  mediaSources?: MediaSourceRegistry
  /**
   * Cloud AI state: key, settings, usage. The app passes one it has loaded and shares with the job
   * queue. The default keeps nothing on disk and has no key, so tests never reach the network.
   */
  ai?: AiService
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({
  layoutFile,
  recentFile,
  jobs = new JobQueue(unavailableExecutors()),
  system = {},
  analysisStorage = { load: loadAnalysisFile, save: saveAnalysisFile },
  onAnalysisChanged,
  mediaSources = new MediaSourceRegistry(),
  ai = new AiService({
    secrets: unavailableSecretStore,
    state: memoryAiStateStorage(),
    createClient: (apiKey) => createAnthropicClient({ apiKey })
  })
}: IpcHandlerOptions): IpcHandlers {
  const analysis = new AnalysisService({
    queue: jobs,
    storage: analysisStorage,
    onChange: onAnalysisChanged,
    vision: { availability: () => ai.visionAvailability() }
  })
  const actions: SystemActions = {
    pickFolder: system.pickFolder ?? unavailable,
    revealFolder: system.revealFolder ?? unavailable,
    trashFolder: system.trashFolder ?? unavailable,
    documentsDir: system.documentsDir ?? unavailable,
    pickMediaFiles: system.pickMediaFiles ?? unavailable
  }
  // Poster frames queued and not yet settled, so repeated requests do not queue one frame twice.
  const pendingPosters = new Set<string>()

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
    'media:posters': ({ projectFolder, items }) =>
      ensureShortPosters(projectFolder, items, jobs, pendingPosters),
    'media:poster:read': ({ projectFolder, frame }) => readPosterDataUrl(projectFolder, frame),
    'media:proxy': ({ projectFolder, items }) => ensureMediaProxies(projectFolder, items, jobs),
    'analysis:sync': async ({ projectFolder, items }) => ({
      file: await analysis.sync(projectFolder, items)
    }),
    'analysis:setAuto': async ({ projectFolder, enabled, items }) => ({
      file: await analysis.setAutoAnalyze(projectFolder, enabled, items)
    }),
    'analysis:reanalyze': async ({ projectFolder, item }) => ({
      file: await analysis.reanalyze(projectFolder, item)
    }),
    'analysis:visionDecision': async ({ projectFolder, decision }) => ({
      file: await analysis.setVisionDecision(projectFolder, decision)
    }),
    'analysis:transcript:read': ({ projectFolder, mediaId }) =>
      readMediaTranscript(projectFolder, mediaId),
    'analysis:vision:read': ({ projectFolder, mediaId }) => readMediaVision(projectFolder, mediaId),
    'analysis:playback': ({ playing }) => {
      analysis.setPlaybackActive(playing)
      return { playing }
    },
    'ai:status': () => ai.status(),
    'ai:settings:update': (patch) => ai.updateSettings(patch),
    'ai:key:save': ({ apiKey }) => ai.saveKey(apiKey),
    'ai:key:clear': () => ai.clearKey(),
    'ai:key:test': () => ai.testKey(),
    'ai:vision:estimate': ({ shotCount }) => ai.estimateVision(shotCount),
    'media:sources': async ({ projectFolder, media }) => ({
      sources: await describeMediaSources(projectFolder, media, mediaSources)
    })
  }
}
