import { BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ZodTypeAny } from 'zod'
import {
  analysisRequestSchema,
  apiKeySchema,
  createProjectSchema,
  exportRequestSchema,
  idSchema,
  narrationSchema,
  segmentSchema,
  shortPatchSchema
} from '../shared/schemas'
import { normalizeSegments, validateShortDuration, type Segment } from '../shared/timeline'
import type { ProjectView } from '../shared/api'
import { IPC, PLAYABLE_VIDEO_CODECS, type SettingsView } from '../shared/types'
import { Store } from './store'
import { SecretStore } from './secrets'
import { JobRunner, defaultSettings } from './jobs'
import { binPath, probeMedia } from './ffmpeg'
import { whisperFiles } from './transcribe'
import { z } from 'zod'
import type { OpenDialogOptions } from 'electron'


const VIDEO_EXTS = ['.mp4', '.mov', '.m4v']
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac'])

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

export function registerIpc(deps: IpcDeps): void {
  const { store, secrets, jobs, userDataDir } = deps
  const projectView = (id: string): ProjectView => {
    const p = store.getProject(id)
    return { ...p, sourceMissing: Boolean(p.sourcePath && !existsSync(p.sourcePath)) }
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
      musicFolder: store.getMusicFolder(),
      whisperAvailable: whisperFiles() !== null,
      ffmpegAvailable
    }
  }

  async function chooseSource(projectId: string): Promise<ProjectView | null> {
    const picked = await openDialog(deps.getWindow(), {
      title: 'Choose a source video',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: VIDEO_EXTS.map((e) => e.slice(1)) }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    const path = picked.filePaths[0]
    if (!VIDEO_EXTS.includes(extname(path).toLowerCase())) {
      throw new Error('Only MP4, MOV or M4V files are supported.')
    }
    // Probe real streams; never trust the extension alone.
    const probe = await probeMedia(path)
    store.updateProject(projectId, { sourcePath: path, probe, proxyPath: null })
    if (!PLAYABLE_VIDEO_CODECS.has(probe.videoCodec)) {
      // Renderer cannot decode this codec directly; make a cache-only H.264 preview in the background.
      jobs.startProxy(projectId)
    }
    return projectView(projectId)
  }

  handle(IPC.projectList, noPayload, () => store.listProjects().map((p) => projectView(p.id)))
  handle(IPC.projectCreate, createProjectSchema, ({ name }) =>
    projectView(store.createProject(name).id)
  )
  handle(IPC.projectDelete, idSchema, (id) => {
    if (jobs.isBusy()) throw new Error('Wait for the running job to finish before deleting a project.')
    store.deleteProject(id)
    rmSync(join(userDataDir, 'cache', id), { recursive: true, force: true })
    rmSync(join(userDataDir, 'narration', id), { recursive: true, force: true })
  })
  handle(IPC.projectImportMedia, idSchema, (id) => chooseSource(id))
  handle(IPC.projectRelinkMedia, idSchema, (id) => chooseSource(id))
  handle(IPC.projectMediaUrl, idSchema, (id) => `shorts-media://project/${id}`)

  handle(IPC.shortList, idSchema, (projectId) => store.listShorts(projectId))

  handle(
    IPC.shortCreate,
    z.object({
      projectId: idSchema,
      segments: z.array(segmentSchema).min(1).max(6),
      title: z.string().max(120).optional()
    }),
    ({ projectId, segments, title }) => {
      const project = store.getProject(projectId)
      const clean = normalizeSegments(segments, project.probe?.durationSec ?? 0)
      if (clean.length === 0) throw new Error('Those times are outside the video.')
      const settings = defaultSettings('9:16')
      const [created] = store.addShorts([
        {
          projectId,
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
      return created
    }
  )

  handle(
    IPC.shortUpdate,
    z.object({ id: idSchema, patch: shortPatchSchema }),
    ({ id, patch }) => {
      const short = store.getShort(id)
      const duration = store.getProject(short.projectId).probe?.durationSec ?? 0
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
      return store.updateShort(id, next)
    }
  )

  handle(IPC.shortDelete, idSchema, (id) => store.deleteShort(id))

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
    return jobs.startExport(req)
  })

  handle(IPC.exportCancel, idSchema, (jobId) => jobs.cancel(jobId))
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
  handle(IPC.settingsSetMusicFolder, noPayload, async () => {
    const picked = await openDialog(deps.getWindow(), {
      title: 'Choose a folder of music you own',
      properties: ['openDirectory']
    })
    if (!picked.canceled && picked.filePaths[0]) store.setMusicFolder(picked.filePaths[0])
    return settingsView()
  })
  handle(IPC.musicList, noPayload, () => {
    const folder = store.getMusicFolder()
    if (!folder || !existsSync(folder)) return []
    return readdirSync(folder).filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase())).map((f) => basename(f))
  })
  handle(IPC.dialogPickOutputDir, noPayload, async () => {
    const picked = await openDialog(deps.getWindow(), {
      title: 'Choose where to save the shorts',
      properties: ['openDirectory', 'createDirectory']
    })
    return picked.canceled ? null : (picked.filePaths[0] ?? null)
  })
}
