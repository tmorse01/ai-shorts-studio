import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ZodTypeAny } from 'zod'
import {
  analysisRequestSchema,
  apiKeySchema,
  createProjectSchema,
  exportRequestSchema,
  idSchema,
  narrationSchema,
  projectUpdateSchema,
  segmentSchema,
  shortPatchSchema
} from '../shared/schemas'
import { normalizeSegments, validateShortDuration, type Segment } from '../shared/timeline'
import type { ProjectView, ThumbStatus } from '../shared/api'
import { IPC, PLAYABLE_VIDEO_CODECS, type MediaAsset, type MediaView, type SettingsView } from '../shared/types'
import { Store } from './store'
import { SecretStore } from './secrets'
import { JobRunner, defaultSettings } from './jobs'
import { binPath, probeMedia } from './ffmpeg'
import { whisperFiles } from './transcribe'
import { thumbDir, thumbnailStep, thumbsReady } from './thumbnails'
import { clipFrameFile, ensurePoster, renderClipFrame } from './poster'
import { z } from 'zod'
import type { OpenDialogOptions } from 'electron'

const VIDEO_EXTS = ['.mp4', '.mov', '.m4v']
const AUDIO_EXTS = ['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac']
/** Filter for the open dialogs: video and audio together. */
const MEDIA_FILTERS = [
  { name: 'Video and audio', extensions: [...VIDEO_EXTS, ...AUDIO_EXTS].map((e) => e.slice(1)) }
]

export interface IpcDeps {
  store: Store
  secrets: SecretStore
  jobs: JobRunner
  userDataDir: string
  getWindow: () => BrowserWindow | null
}

/** Open a native dialog parented to the main window when one exists. */
function openDialog(win: BrowserWindow | null, options: OpenDialogOptions) {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

/** Typed handler: rejects malformed payloads before they reach any real logic. */
function handle<S extends ZodTypeAny>(channel: string, schema: S, fn: (input: z.output<S>) => unknown): void {
  ipcMain.handle(channel, (_event, raw: unknown) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid request for ${channel}: ${parsed.error.issues[0]?.message ?? 'bad input'}`)
    }
    return fn(parsed.data)
  })
}

const noPayload = z.undefined()

/** Throws unless the path is a video or audio type the app can read. Probing happens separately. */
function assertMediaPath(path: string): void {
  const ext = extname(path).toLowerCase()
  if (![...VIDEO_EXTS, ...AUDIO_EXTS].includes(ext)) {
    throw new Error('Only MP4, MOV or M4V video, and MP3, M4A, WAV, AAC, OGG or FLAC audio, are supported.')
  }
}

export function registerIpc(deps: IpcDeps): void {
  const { store, secrets, jobs, userDataDir } = deps

  const mediaView = (m: MediaAsset): MediaView => ({ ...m, missing: !existsSync(m.path) })
  const projectView = (id: string): ProjectView => {
    const p = store.getProject(id)
    return { ...p, media: p.media.map(mediaView) }
  }

  const settingsView = (): SettingsView => {
    let ffmpegAvailable = true
    try {
      binPath('ffmpeg')
      binPath('ffprobe')
    } catch {
      ffmpegAvailable = false
    }
    return {
      hasApiKey: secrets.has(),
      keyStorage: secrets.available() ? 'safeStorage' : 'unavailable',
      lastExport: store.getLastExport(),
      whisperAvailable: whisperFiles() !== null,
      ffmpegAvailable
    }
  }

  /** The source video a clip was cut from, or null when there is none. */
  const assetOf = (sourceId: string | null): MediaAsset | null => {
    if (!sourceId) return null
    try {
      return store.findMediaAsset(sourceId).asset
    } catch {
      return null
    }
  }

  /** Length of a short's source video, or 0 when the short has none. */
  const sourceDuration = (sourceId: string | null): number =>
    sourceId ? store.findMediaAsset(sourceId).asset.probe.durationSec : 0

  /** Probe each file and add it to the project's library as footage. */
  async function importFiles(projectId: string, paths: string[]): Promise<ProjectView> {
    const assets: MediaAsset[] = []
    for (const path of paths) {
      assertMediaPath(path)
      // Probe real streams; never trust the extension alone.
      const probe = await probeMedia(path)
      assets.push({
        id: randomUUID(),
        name: basename(path),
        // Audio-only files have no picture; they go to the music filter.
        kind: probe.videoCodec === 'none' ? 'music' : 'source',
        path,
        probe,
        proxyPath: null,
        createdAt: new Date().toISOString()
      })
    }
    store.addMediaAssets(projectId, assets)
    for (const asset of assets) await ensurePoster(userDataDir, projectId, asset)
    return projectView(projectId)
  }

  handle(IPC.projectList, noPayload, () => store.listProjects().map((p) => projectView(p.id)))
  handle(IPC.projectCreate, createProjectSchema, ({ name }) => projectView(store.createProject(name).id))
  handle(IPC.projectUpdate, projectUpdateSchema, ({ id, patch }) => {
    store.updateProject(id, patch)
    return projectView(id)
  })
  handle(IPC.projectDelete, idSchema, (id) => {
    if (jobs.isBusy()) throw new Error('Wait for the running job to finish before deleting a project.')
    store.deleteProject(id)
    rmSync(join(userDataDir, 'cache', id), { recursive: true, force: true })
    rmSync(join(userDataDir, 'narration', id), { recursive: true, force: true })
  })

  handle(IPC.mediaImport, idSchema, async (projectId): Promise<ProjectView | null> => {
    store.getProject(projectId)
    const picked = await openDialog(deps.getWindow(), {
      title: 'Add media to this project',
      properties: ['openFile', 'multiSelections'],
      filters: MEDIA_FILTERS
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    return importFiles(projectId, picked.filePaths)
  })

  handle(IPC.mediaRelink, idSchema, async (assetId): Promise<ProjectView | null> => {
    const { project, asset } = store.findMediaAsset(assetId)
    const picked = await openDialog(deps.getWindow(), {
      title: `Find ${asset.name}`,
      properties: ['openFile'],
      filters: MEDIA_FILTERS
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    const path = picked.filePaths[0]
    assertMediaPath(path)
    const probe = await probeMedia(path)
    // A different file can have different frames, so cached thumbnails and the preview are stale.
    rmSync(join(userDataDir, 'cache', project.id, asset.id), { recursive: true, force: true })
    if (asset.proxyPath) rmSync(asset.proxyPath, { force: true })
    store.updateMediaAsset(assetId, { name: basename(path), path, probe, proxyPath: null })
    return projectView(project.id)
  })

  /** Fill in missing posters, e.g. for files imported before posters existed. Resolves when all are ready. */
  handle(IPC.mediaPosters, idSchema, async (projectId) => {
    for (const asset of store.getProject(projectId).media) await ensurePoster(userDataDir, projectId, asset)
    for (const short of store.listShorts(projectId)) {
      if (!existsSync(clipFrameFile(userDataDir, projectId, short.id))) {
        await renderClipFrame(userDataDir, short, assetOf(short.sourceId))
      }
    }
    return null
  })

  handle(IPC.mediaRemove, idSchema, (assetId) => {
    if (jobs.isBusy()) throw new Error('Wait for the running job to finish before removing a video.')
    const { project, asset } = store.findMediaAsset(assetId)
    store.removeMediaAsset(assetId)
    // Only app-owned cache goes. The user's file is never touched.
    rmSync(join(userDataDir, 'cache', project.id, asset.id), { recursive: true, force: true })
    if (asset.proxyPath) rmSync(asset.proxyPath, { force: true })
    return projectView(project.id)
  })

  /** Start the H.264 preview when the codec cannot play in the renderer and no preview exists yet. */
  handle(IPC.mediaPrepare, idSchema, (assetId) => {
    const { project, asset } = store.findMediaAsset(assetId)
    const hasPicture = asset.probe.videoCodec !== 'none'
    const needsProxy = hasPicture && !PLAYABLE_VIDEO_CODECS.has(asset.probe.videoCodec) && !asset.proxyPath
    if (needsProxy && asset.kind === 'source' && existsSync(asset.path) && !jobs.isBusy()) {
      jobs.startProxy(project.id, asset.id)
    }
    return projectView(project.id)
  })

  handle(IPC.thumbsEnsure, idSchema, (assetId): ThumbStatus => {
    const { project, asset } = store.findMediaAsset(assetId)
    const duration = asset.probe.durationSec
    // Audio has no frames to thumbnail.
    if (asset.probe.videoCodec === 'none') return { ready: true, stepSec: 1, count: 0 }
    const ready = thumbsReady(thumbDir(userDataDir, project.id, asset.id))
    if (ready) return { ready: true, stepSec: ready.stepSec, count: ready.count }
    // A busy runner means thumbnails wait; the renderer asks again when the running job finishes.
    if (existsSync(asset.path) && !jobs.isBusy()) jobs.startThumbnails(project.id, asset.id)
    return { ready: false, stepSec: thumbnailStep(duration), count: 0 }
  })

  handle(IPC.shortList, idSchema, (projectId) => store.listShorts(projectId))

  handle(
    IPC.shortCreate,
    z.object({
      projectId: idSchema,
      sourceId: idSchema,
      segments: z.array(segmentSchema).min(1).max(6),
      title: z.string().max(120).optional()
    }),
    async ({ projectId, sourceId, segments, title }) => {
      const owner = store.findMediaAsset(sourceId)
      if (owner.project.id !== projectId || owner.asset.kind !== 'source') {
        throw new Error('Pick a source video in this project.')
      }
      const clean = normalizeSegments(segments, owner.asset.probe.durationSec)
      if (clean.length === 0) throw new Error('Those times are outside the video.')
      const settings = defaultSettings('9:16')
      const [created] = store.addShorts([
        {
          projectId,
          sourceId,
          title: title ?? `Manual short ${store.listShorts(projectId).length + 1}`,
          reason: 'Added manually.',
          provenance: 'manual',
          rank: null,
          segments: clean,
          captions: [],
          narrationPath: null,
          settings,
          exportedPath: null
        }
      ])
      await renderClipFrame(userDataDir, created, owner.asset)
      return created
    }
  )

  handle(
    IPC.shortUpdate,
    z.object({ id: idSchema, patch: shortPatchSchema }),
    async ({ id, patch }) => {
      const short = store.getShort(id)
      const duration = sourceDuration(short.sourceId)
      const next: Parameters<Store['updateShort']>[1] = {}
      if (patch.title !== undefined) next.title = patch.title
      if (patch.captions !== undefined) next.captions = patch.captions
      if (patch.settings !== undefined) next.settings = patch.settings
      if (patch.segments !== undefined) {
        const clean = normalizeSegments(patch.segments as Segment[], duration)
        const problem = validateShortDuration(clean)
        if (problem) throw new Error(problem)
        next.segments = clean
      }
      const updated = store.updateShort(id, next)
      // New cuts mean a new first frame, so the clip card is redrawn from its source.
      if (next.segments) await renderClipFrame(userDataDir, updated, assetOf(updated.sourceId))
      return updated
    }
  )

  handle(IPC.shortDelete, idSchema, (id) => {
    const { projectId } = store.getShort(id)
    store.deleteShort(id)
    rmSync(clipFrameFile(userDataDir, projectId, id), { force: true })
  })

  handle(IPC.shortNarrate, narrationSchema, ({ projectId, shortId, audio }) => {
    store.getProject(projectId)
    const short = store.getShort(shortId)
    const dir = join(userDataDir, 'narration', projectId)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${shortId}-${randomUUID()}.webm`)
    writeFileSync(file, Buffer.from(audio))
    if (short.narrationPath && existsSync(short.narrationPath)) rmSync(short.narrationPath, { force: true })
    store.setShortExport(shortId, short.exportedPath, file)
    return store.getShort(shortId)
  })

  handle(IPC.shortClearNarration, z.object({ projectId: idSchema, shortId: idSchema }), ({ projectId, shortId }) => {
    store.getProject(projectId)
    const short = store.getShort(shortId)
    if (short.narrationPath && existsSync(short.narrationPath)) rmSync(short.narrationPath, { force: true })
    store.setShortExport(shortId, short.exportedPath, null)
    return store.getShort(shortId)
  })

  handle(IPC.analysisStart, analysisRequestSchema, (req) => jobs.startAnalysis(req))

  handle(IPC.exportStart, exportRequestSchema, (req) => {
    for (const id of req.shortIds) {
      const short = store.getShort(id)
      const problem = validateShortDuration(short.segments)
      if (problem) throw new Error(`"${short.title}": ${problem}`)
    }
    const job = jobs.startExport(req)
    store.setLastExport({ outputDir: req.outputDir, options: req.options })
    return job
  })

  handle(IPC.exportCancel, idSchema, (jobId) => jobs.cancel(jobId))

  // Only a short's own finished export can be revealed or opened, never an arbitrary path from the renderer.
  const exportedPathOf = (shortId: string): string => {
    const short = store.getShort(shortId)
    if (!short.exportedPath || !existsSync(short.exportedPath)) {
      throw new Error('That export was moved or deleted.')
    }
    return short.exportedPath
  }
  handle(IPC.exportReveal, idSchema, (shortId) => {
    shell.showItemInFolder(exportedPathOf(shortId))
  })
  handle(IPC.exportOpen, idSchema, async (shortId) => {
    const problem = await shell.openPath(exportedPathOf(shortId))
    if (problem) throw new Error(`Could not open the file: ${problem}`)
  })
  handle(IPC.jobList, z.string().max(64).optional(), (projectId) => store.listJobs(projectId || undefined))

  handle(IPC.settingsGet, noPayload, () => settingsView())
  handle(IPC.settingsSetApiKey, apiKeySchema, ({ key }) => {
    secrets.save(key.trim())
    return settingsView()
  })
  handle(IPC.settingsClearApiKey, noPayload, () => {
    secrets.clear()
    return settingsView()
  })
  handle(IPC.dialogPickOutputDir, noPayload, async () => {
    const picked = await openDialog(deps.getWindow(), {
      title: 'Choose where to save the shorts',
      properties: ['openDirectory', 'createDirectory']
    })
    return picked.canceled ? null : (picked.filePaths[0] ?? null)
  })
}
