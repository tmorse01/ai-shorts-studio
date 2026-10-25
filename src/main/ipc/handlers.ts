import { readLayoutFile, writeLayoutFile } from '../layoutFile'
import { readExportSettingsFile, writeExportSettingsFile } from '../export/exportSettingsFile'
import { RenderQueueService, type ShortExportedEvent } from '../export/renderQueue'
import type { EncoderInfo, ExportSettings } from '@shared/export/exportSettings'
import type { RenderJob } from '@shared/export/renderQueue'
import { access, writeFile } from 'node:fs/promises'
import {
  createProject,
  openProject,
  readProjectBatch,
  saveProject,
  saveProjectBatch
} from '../project/projectStorage'
import { BatchRunner } from '../batch/batchRunner'
import { recoverInterruptedBatch, type Batch } from '@shared/batch/batch'
import { analysisFramesDir } from '../analysis/frameCache'
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
import { loadAnalysisFile, saveAnalysisFile, visionResultPath } from '../analysis/analysisFile'
import { readMediaTranscript } from '../analysis/transcriptRead'
import { transcribeMediaItems } from '../captions/transcribeMedia'
import { readMediaVision } from '../analysis/visionRead'
import { AiService } from '../ai/aiService'
import { memoryAiStateStorage } from '../ai/aiStateFile'
import { unavailableSecretStore } from '../ai/secretStore'
import { createAnthropicClient } from '../ai/anthropicClient'
import { estimateScriptRun, generateScripts } from '../ai/scriptGenerator'
import { rewriteScriptLine } from '../ai/lineRewriter'
import { matchFootageRequest } from '../ai/footageMatcher'
import { readScriptFootage, type ScriptFootageSource } from '../ai/scriptFootage'
import { SpeechService } from '../tts/speechService'
import { createElevenLabsProvider } from '../tts/elevenLabsProvider'
import { isE2eMode } from '../e2e/e2eMode'
import { createFakeSpeechProvider } from '../e2e/fakes'
import { saveNarrationTake } from '../narration/takeStorage'
import {
  dismissSuggestions,
  findMomentSuggestions,
  readSuggestionFootage,
  readSuggestions,
  type SuggestionFootageSource
} from '../analysis/suggestionsService'

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
  /** Shows the save dialog for an SRT file and writes the text. Resolves the saved path, or null on cancel. */
  saveSrtFile: (file: { suggestedName: string; text: string }) => Promise<string | null>
}

const unavailable = (): never => {
  throw new UserFacingError('This action is not available here.')
}

export interface IpcHandlerOptions {
  /** Where the editor layout is saved. The app passes a file in user data; tests pass a temp file. */
  layoutFile: string
  /** Where the recent projects registry is saved. Same rule as layoutFile. */
  recentFile: string
  /** Where the shared export settings are saved. Without it they are kept in memory only. */
  exportSettingsFile?: string
  /** The encoder found at startup. Null until detection ends. Defaults to null. */
  exportEncoder?: () => EncoderInfo | null
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
  /** Text-to-speech service. Defaults to one that reads the key from `ai` and has no provider. */
  speech?: SpeechService
  /** Reads the footage that script drafting is grounded in. Tests pass a fake, so no disk is read. */
  scriptFootage?: ScriptFootageSource
  /** Reads the transcript, shots and descriptions that clip suggestions are based on. Tests pass a fake. */
  suggestionFootage?: SuggestionFootageSource
  /** Told whenever a batch changes. The app forwards it to the renderer. */
  onBatchChanged?: (projectFolder: string, batch: Batch) => void
  /** Told whenever an export in the render queue changes. The app forwards it to the renderer. */
  onRenderQueueChanged?: (jobs: RenderJob[]) => void
  /** Told when an export finished and its short is recorded as Exported. */
  onShortExported?: (event: ShortExportedEvent) => void
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({
  layoutFile,
  recentFile,
  exportSettingsFile,
  exportEncoder = () => null,
  jobs = new JobQueue(unavailableExecutors()),
  system = {},
  analysisStorage = { load: loadAnalysisFile, save: saveAnalysisFile },
  onAnalysisChanged,
  mediaSources = new MediaSourceRegistry(),
  ai = new AiService({
    secrets: unavailableSecretStore,
    state: memoryAiStateStorage(),
    createClient: (apiKey) => createAnthropicClient({ apiKey })
  }),
  speech = new SpeechService({
    keys: ai,
    createProvider: (apiKey) =>
      isE2eMode() ? createFakeSpeechProvider() : createElevenLabsProvider({ apiKey })
  }),
  scriptFootage = readScriptFootage,
  suggestionFootage = readSuggestionFootage,
  onBatchChanged,
  onRenderQueueChanged,
  onShortExported
}: IpcHandlerOptions): IpcHandlers {
  const analysis = new AnalysisService({
    queue: jobs,
    storage: analysisStorage,
    onChange: onAnalysisChanged,
    vision: { availability: () => ai.visionAvailability() }
  })
  // Batch runs keep their live state here. Saved batches are read from and written to project.json.
  const batches = new BatchRunner({
    queue: jobs,
    jobExtras: (folder, stage, mediaId) => ({
      outDir: analysisFramesDir(folder, mediaId),
      resultFile: stage === 'vision' ? visionResultPath(folder, mediaId) : undefined
    }),
    load: async (folder, batchId) => {
      const batch = await readProjectBatch(folder, batchId)
      return batch && recoverInterruptedBatch(batch)
    },
    save: saveProjectBatch,
    onChange: onBatchChanged,
    onSaveError: (error) =>
      logError({
        occurredAt: new Date().toISOString(),
        source: 'main',
        summary: `Saving a batch failed: ${String(error)}`
      })
  })
  const actions: SystemActions = {
    pickFolder: system.pickFolder ?? unavailable,
    revealFolder: system.revealFolder ?? unavailable,
    trashFolder: system.trashFolder ?? unavailable,
    documentsDir: system.documentsDir ?? unavailable,
    pickMediaFiles: system.pickMediaFiles ?? unavailable,
    saveSrtFile: system.saveSrtFile ?? unavailable
  }
  // Poster frames queued and not yet settled, so repeated requests do not queue one frame twice.
  const pendingPosters = new Set<string>()
  // Export settings when no file is given (tests): kept for the life of the handlers.
  let memoryExportSettings: ExportSettings | null = null
  // Exports run on the media job queue. The render queue lists them and records each finished short.
  const renders = new RenderQueueService({
    queue: jobs,
    readProject: async (folderPath) => (await openProject(folderPath)).project,
    writeProject: saveProject,
    readSettings: () =>
      exportSettingsFile
        ? readExportSettingsFile(exportSettingsFile)
        : Promise.resolve(memoryExportSettings),
    encoder: exportEncoder,
    fileExists: (file) =>
      access(file).then(
        () => true,
        () => false
      ),
    writeText: (path, text) => writeFile(path, text, 'utf8'),
    reveal: (path) => actions.revealFolder(path),
    onChange: onRenderQueueChanged,
    onExported: onShortExported,
    onError: (summary) =>
      logError({ occurredAt: new Date().toISOString(), source: 'main', summary })
  })

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
    'export:state:get': async () => ({
      encoder: exportEncoder(),
      settings: exportSettingsFile
        ? await readExportSettingsFile(exportSettingsFile)
        : memoryExportSettings
    }),
    'export:settings:save': async ({ settings }) => {
      if (exportSettingsFile) await writeExportSettingsFile(exportSettingsFile, settings)
      else memoryExportSettings = settings
      return { saved: true }
    },
    'export:queue:list': () => ({ jobs: renders.list() }),
    'export:start': async ({ projectFolder, shortIds }) => ({
      jobs: await renders.start(projectFolder, shortIds)
    }),
    'export:cancel': ({ jobId }) => ({ cancelled: renders.cancel(jobId) }),
    'export:reveal': ({ jobId }) => {
      renders.reveal(jobId)
      return { revealed: true }
    },
    'ui:layout:load': async () => ({ layout: await readLayoutFile(layoutFile) }),
    'ui:layout:save': async ({ layout }) => {
      await writeLayoutFile(layoutFile, layout)
      return { saved: true }
    },
    'media:probe': ({ path }) => jobs.enqueue('probe', path).done,
    'media:job:list': () => ({ jobs: jobs.list() }),
    'media:job:cancel': ({ jobId }) => ({ cancelled: jobs.cancel(jobId) }),
    'batch:run': async ({ projectFolder, stage, kind, reuseFootage, items }) => ({
      batch: await batches.start({ projectFolder, stage, kind, reuseFootage, items })
    }),
    'batch:cancel': async ({ projectFolder, batchId, itemId }) =>
      batches.cancel(projectFolder, batchId, itemId),
    'batch:retry': async ({ projectFolder, batchId, items }) =>
      batches.retry(projectFolder, batchId, items),
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
    'analysis:cancel': async ({ projectFolder, item }) => ({
      file: await analysis.cancel(projectFolder, item)
    }),
    'analysis:visionDecision': async ({ projectFolder, decision }) => ({
      file: await analysis.setVisionDecision(projectFolder, decision)
    }),
    'analysis:transcript:read': ({ projectFolder, mediaId }) =>
      readMediaTranscript(projectFolder, mediaId),
    'captions:transcribe': async ({ projectFolder, items }) => ({
      transcripts: await transcribeMediaItems(projectFolder, items, jobs)
    }),
    'captions:exportSrt': async ({ suggestedName, srt }) => ({
      savedPath: await actions.saveSrtFile({ suggestedName, text: srt })
    }),
    'analysis:vision:read': ({ projectFolder, mediaId }) => readMediaVision(projectFolder, mediaId),
    'analysis:suggestions:read': ({ projectFolder, mediaId }) =>
      readSuggestions(projectFolder, mediaId, suggestionFootage),
    'analysis:suggestions:findMoments': (input) =>
      findMomentSuggestions(ai, input, suggestionFootage),
    'analysis:suggestions:dismiss': ({ projectFolder, mediaId, keys }) =>
      dismissSuggestions(projectFolder, mediaId, keys, suggestionFootage),
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
    'ai:scripts:estimate': (input) => estimateScriptRun(ai, scriptFootage, input),
    'ai:scripts:generate': async (input) => ({
      scripts: await generateScripts(ai, scriptFootage, input)
    }),
    'ai:scripts:rewriteLine': (input) => rewriteScriptLine(ai, input),
    'ai:footage:match': (input) => matchFootageRequest(ai, input),
    'tts:status': () => speech.status(),
    'tts:key:save': ({ apiKey }) => speech.saveKey(apiKey),
    'tts:key:clear': () => speech.clearKey(),
    'tts:voices': ({ projectFolder }) => speech.voices(projectFolder),
    'tts:defaultVoice:set': ({ projectFolder, defaultVoiceId }) =>
      speech.setDefaultVoice(projectFolder, defaultVoiceId),
    'tts:estimate': (input) => speech.estimate(input),
    'tts:generate': (input) => speech.generate(input),
    'narration:take:save': ({ projectFolder, bytes }) => saveNarrationTake(projectFolder, bytes),
    'media:sources': async ({ projectFolder, media }) => ({
      sources: await describeMediaSources(projectFolder, media, mediaSources)
    })
  }
}
