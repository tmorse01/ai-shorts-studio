import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { buildAss } from '../shared/timeline'
import type { Job, MediaAsset, Project, ProbeInfo, Short } from '../shared/types'
import type { AnalysisRequest, ExportRequest } from '../shared/schemas'
import type { ExportItem } from '../shared/types'
import { rankCandidates, AiError, type FrameSample } from './ai'
import {
  captionsForSegments,
  transcribeSource,
  transcriptForWindows,
  type TranscriptSegment
} from './transcribe'
import {
  detectSceneCuts,
  extractFrame,
  frameTimes,
  makeAnalysisScratch,
  makeCandidates,
  removeScratch
} from './analysis'
import { binPath, buildExportArgs, probeMedia, ProcessCancelledError, runProcess } from './ffmpeg'
import { pickMusicTrack } from './music'
import type { Store } from './store'
import { buildThumbArgs, thumbDir, thumbnailStep, writeThumbMeta } from './thumbnails'
import { renderClipFrame } from './poster'

export interface JobDeps {
  store: Store
  userDataDir: string
  getApiKey: () => string | null
  /** Pushes job state to the renderer. */
  notify: (job: Job) => void
}

/** A media asset together with the project that owns it. */
interface Owned {
  project: Project
  asset: MediaAsset
}

/**
 * Runs at most one heavyweight job (analysis or export) at a time. Starting a second one while
 * one is active is refused rather than queued, so the UI never shows phantom queued work.
 */
export class JobRunner {
  private active: {
    job: Job
    controller: AbortController
    /** Every process the running job has started and not yet exited. Analysis can run several at once. */
    children: Set<ChildProcessWithoutNullStreams>
  } | null = null

  constructor(private readonly deps: JobDeps) {}

  isBusy(): boolean {
    return this.active !== null
  }

  cancel(jobId: string): boolean {
    if (!this.active || this.active.job.id !== jobId) return false
    this.active.controller.abort()
    for (const child of this.active.children) child.kill()
    return true
  }

  private begin(projectId: string, kind: Job['kind']): Job {
    if (this.active) throw new Error('Another job is already running. Wait for it to finish or cancel it.')
    const job = this.deps.store.createJob({ projectId, kind })
    this.active = { job, controller: new AbortController(), children: new Set() }
    this.deps.notify(job)
    return job
  }

  private progress(job: Job, progress: number, message: string, items?: ExportItem[]): void {
    const extra = items ? { items } : {}
    this.deps.store.updateJob(job.id, { progress: Math.round(progress), message, ...extra })
    this.deps.notify({ ...job, progress: Math.round(progress), message, ...extra })
  }

  private finish(job: Job, status: Job['status'], error: string | null, message: string, items?: ExportItem[]): void {
    const extra = items ? { items } : {}
    this.deps.store.updateJob(job.id, { status, error, message, progress: status === 'completed' ? 100 : 0, ...extra })
    this.deps.notify({ ...job, status, error, message, progress: status === 'completed' ? 100 : 0, ...extra })
    this.active = null
  }

  private attachChild(child: ChildProcessWithoutNullStreams): void {
    const active = this.active
    if (!active) return
    active.children.add(child)
    child.once('close', () => active.children.delete(child))
  }

  /** Resolve a media asset and check it belongs to the project the caller named. */
  private sourceFor(projectId: string, assetId: string): Owned {
    const found = this.deps.store.findMediaAsset(assetId)
    if (found.project.id !== projectId) throw new Error('That video is not in this project.')
    return found
  }

  /** Analysis: scene cuts → candidate windows → frames → Claude ranking → saved shorts. */
  async startAnalysis(req: AnalysisRequest): Promise<Job> {
    const { project, asset } = this.sourceFor(req.projectId, req.sourceId)
    if (asset.kind !== 'source') throw new Error('Only imported videos can be analysed.')
    if (!existsSync(asset.path)) throw new Error('This video was moved or deleted. Relink it first.')
    const apiKey = this.deps.getApiKey()
    if (!apiKey) throw new Error('Add your Anthropic API key in Settings to run AI analysis.')
    const job = this.begin(project.id, 'analysis')
    const scratch = makeAnalysisScratch(this.deps.userDataDir, project.id, job.id)
    void this.runAnalysis(job, { project, asset }, req, apiKey, scratch)
    return job
  }

  private async runAnalysis(
    job: Job,
    { project, asset }: Owned,
    req: AnalysisRequest,
    apiKey: string,
    scratch: string
  ): Promise<void> {
    const signal = this.active?.controller.signal
    try {
      const probe = asset.probe
      this.progress(
        job,
        3,
        probe.hasAudio
          ? 'Transcribing speech and detecting scene changes (first run per video is slower)…'
          : 'Detecting scene changes…'
      )
      // Transcription (CPU) and scene detection (NVDEC when the codec allows it) read the same file but
      // do not depend on each other, so they run together.
      const speechTask = (async (): Promise<{ transcript: TranscriptSegment[]; speechNote: string | null }> => {
        if (!probe.hasAudio) return { transcript: [], speechNote: null }
        try {
          const transcript = await transcribeSource({
            sourcePath: asset.path,
            cacheFile: join(this.deps.userDataDir, 'cache', project.id, asset.id, 'transcript.json'),
            scratchDir: join(scratch, 'speech'),
            onSpawn: (c) => this.attachChild(c)
          })
          return { transcript, speechNote: null }
        } catch (err) {
          if (err instanceof ProcessCancelledError) throw err
          return { transcript: [], speechNote: `Speech-to-text skipped: ${(err as Error).message.split('\n')[0]}` }
        }
      })()
      const cutsTask =
        req.sceneDetection === 'off'
          ? Promise.resolve<number[]>([])
          : detectSceneCuts(asset.path, req.sceneDetection, probe.videoCodec, (c) => this.attachChild(c))
      // Wait for both before continuing, then rethrow the first failure so the job fails cleanly.
      const [speechResult, cutsResult] = await Promise.allSettled([speechTask, cutsTask])
      if (speechResult.status === 'rejected') throw speechResult.reason
      if (cutsResult.status === 'rejected') throw cutsResult.reason
      const { transcript, speechNote } = speechResult.value
      const cuts = cutsResult.value
      this.progress(
        job,
        30,
        req.sceneDetection === 'off'
          ? 'Scene detection is off. Using an even grid of windows…'
          : `Found ${cuts.length} scene changes. Building candidate windows…`
      )

      const candidates = makeCandidates(probe.durationSec, req.minSec, req.maxSec, cuts)
      const times = frameTimes(candidates)
      const frames: FrameSample[] = []
      for (let i = 0; i < times.length; i++) {
        this.progress(job, 30 + (i / times.length) * 25, `Sampling frame ${i + 1} of ${times.length}…`)
        frames.push(await extractFrame(asset.path, times[i], scratch, i, (c) => this.attachChild(c)))
      }

      this.progress(job, 60, 'Asking Claude to rank the moments…')
      const suggestions = await rankCandidates({
        apiKey,
        prompt: req.prompt,
        count: req.count,
        minSec: req.minSec,
        maxSec: req.maxSec,
        durationSec: probe.durationSec,
        candidates,
        frames,
        transcript: transcript.length > 0 ? transcriptForWindows(transcript, candidates) : null,
        signal
      })
      if (suggestions.length === 0) {
        throw new Error('Claude returned no shorts that fit the length rules. Try a wider length range.')
      }

      const saved = this.deps.store.addShorts(
        suggestions.map((s) => {
          const captions = captionsForSegments(transcript, s.segments)
          return {
            projectId: project.id,
            sourceId: asset.id,
            title: s.title,
            reason: s.reason,
            provenance: 'ai' as const,
            rank: s.rank,
            segments: s.segments,
            captions,
            narrationPath: null,
            settings: { ...defaultSettings(req.ratio), captionsEnabled: captions.length > 0 },
            exportedPath: null
          }
        })
      )
      for (const short of saved) await renderClipFrame(this.deps.userDataDir, short, asset)
      const message = `Saved ${saved.length} suggested shorts.${speechNote ? ` ${speechNote}` : ''}`
      this.finish(job, 'completed', null, message)
    } catch (err) {
      const cancelled = err instanceof ProcessCancelledError || (err instanceof AiError && err.kind === 'cancelled')
      if (cancelled) {
        this.finish(job, 'cancelled', null, 'Analysis cancelled.')
      } else {
        const message = (err as Error).message
        this.finish(job, 'failed', message, 'Analysis failed.')
      }
    } finally {
      removeScratch(scratch)
    }
  }

  /** One thumbnail every few seconds for a video's strip. Cached per asset; replaced on each run. */
  startThumbnails(projectId: string, assetId: string): Job {
    const owned = this.sourceFor(projectId, assetId)
    const job = this.begin(owned.project.id, 'thumbs')
    void this.runThumbnails(job, owned)
    return job
  }

  private async runThumbnails(job: Job, { project, asset }: Owned): Promise<void> {
    const signal = this.active?.controller.signal
    const dir = thumbDir(this.deps.userDataDir, project.id, asset.id)
    const step = thumbnailStep(asset.probe.durationSec)
    const totalSec = asset.probe.durationSec
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    let lastPct = -1
    try {
      this.progress(job, 0, 'Generating thumbnails…')
      await runProcess(binPath('ffmpeg'), buildThumbArgs(asset.path, dir, step), {
        onSpawn: (c) => this.attachChild(c),
        onStdoutLine: (line) => {
          const m = /^out_time_us=(\d+)/.exec(line)
          if (m && totalSec > 0) {
            const pct = Math.min(99, Math.round((Number(m[1]) / 1e6 / totalSec) * 100))
            if (pct !== lastPct) {
              lastPct = pct
              this.progress(job, pct, 'Generating thumbnails…')
            }
          }
        }
      })
      const count = readdirSync(dir).filter((f) => f.startsWith('thumb-') && f.endsWith('.jpg')).length
      writeThumbMeta(dir, { stepSec: step, count })
      this.finish(job, 'completed', null, `${count} thumbnails ready.`)
    } catch (err) {
      rmSync(dir, { recursive: true, force: true })
      if (err instanceof ProcessCancelledError || signal?.aborted) {
        this.finish(job, 'cancelled', null, 'Thumbnails cancelled.')
      } else {
        this.finish(job, 'failed', (err as Error).message, 'Thumbnails failed.')
      }
    }
  }

  /** Build a 720p H.264 preview for sources the renderer cannot decode directly. Cache only. */
  startProxy(projectId: string, assetId: string): Job {
    const owned = this.sourceFor(projectId, assetId)
    const job = this.begin(owned.project.id, 'proxy')
    void this.runProxy(job, owned)
    return job
  }

  private async runProxy(job: Job, { project, asset }: Owned): Promise<void> {
    const signal = this.active?.controller.signal
    const dir = join(this.deps.userDataDir, 'cache', project.id)
    mkdirSync(dir, { recursive: true })
    const out = join(dir, `proxy-${job.id}.mp4`)
    const totalSec = asset.probe.durationSec
    let lastPct = -1
    try {
      this.progress(job, 0, 'Making an H.264 preview for smooth playback…')
      await runProcess(binPath('ffmpeg'), buildProxyArgs(asset.path, out), {
        onSpawn: (c) => this.attachChild(c),
        onStdoutLine: (line) => {
          const m = /^out_time_us=(\d+)/.exec(line)
          if (m && totalSec > 0) {
            const pct = Math.min(99, Math.round((Number(m[1]) / 1e6 / totalSec) * 100))
            if (pct !== lastPct) {
              lastPct = pct
              this.progress(job, pct, 'Making an H.264 preview for smooth playback…')
            }
          }
        }
      })
      const previous = asset.proxyPath
      this.deps.store.updateMediaAsset(asset.id, { proxyPath: out })
      if (previous && previous !== out) rmSync(previous, { force: true })
      this.finish(job, 'completed', null, 'Preview ready.')
    } catch (err) {
      rmSync(out, { force: true })
      if (err instanceof ProcessCancelledError || signal?.aborted) {
        this.finish(job, 'cancelled', null, 'Preview cancelled.')
      } else {
        this.finish(job, 'failed', (err as Error).message, 'Preview failed. The original file is still usable where supported.')
      }
    }
  }

  /** Export every chosen short as its own MP4 into the user's output folder. */
  startExport(req: ExportRequest): Job {
    const project = this.deps.store.getProject(req.projectId)
    const entries = req.shortIds.map((id) => {
      const short = this.deps.store.getShort(id)
      if (short.projectId !== project.id) throw new Error('Short does not belong to this project.')
      if (!short.sourceId) throw new Error(`"${short.title}" has no source video. Relink or re-add it first.`)
      const { asset } = this.sourceFor(project.id, short.sourceId)
      if (!existsSync(asset.path)) {
        throw new Error('The source video was moved or deleted. Relink it before exporting.')
      }
      return { short, asset }
    })
    const job = this.begin(project.id, 'export')
    void this.runExport(job, project, entries, req)
    return job
  }

  private async runExport(
    job: Job,
    project: Project,
    entries: { short: Short; asset: MediaAsset }[],
    req: ExportRequest
  ): Promise<void> {
    const signal = this.active?.controller.signal
    const scratch = join(this.deps.userDataDir, 'cache', project.id, `export-${job.id}`)
    mkdirSync(scratch, { recursive: true })
    const exported: string[] = []
    let items: ExportItem[] = entries.map(({ short }) => ({
      shortId: short.id,
      title: short.title,
      status: 'queued',
      progress: 0,
      outPath: null
    }))
    // Replaces one short's row and reports the whole list, so the progress dialog never shows stale rows.
    const update = (i: number, patch: Partial<ExportItem>, overall: number, message: string): void => {
      items = items.map((it, j) => (j === i ? { ...it, ...patch } : it))
      this.progress(job, overall, message, items)
    }
    let current = -1
    try {
      for (let i = 0; i < entries.length; i++) {
        current = i
        if (signal?.aborted) throw new ProcessCancelledError()
        const { short, asset } = entries[i]
        const label = `(${i + 1}/${entries.length}) ${short.title}`
        const share = (frac: number): number => ((i + frac) / entries.length) * 100
        update(i, { status: 'preparing', progress: 0 }, share(0), `Preparing ${label}…`)
        const outPath = chooseOutputPath(req.outputDir, short.title, req.overwrite)
        const musicPath = short.settings.musicEnabled ? pickMusicTrack(this.deps.store.musicPaths(project.id), short.id) : null
        const workDir = join(scratch, short.id)
        mkdirSync(workDir, { recursive: true })

        const plan = buildExportArgs(
          {
            sourcePath: asset.path,
            probe: asset.probe,
            segments: short.segments,
            captions: short.captions,
            ratio: short.settings.ratio,
            framing: short.settings.framing,
            captionsEnabled: short.settings.captionsEnabled,
            captionFontSize: short.settings.captionFontSize,
            musicPath,
            musicVolume: short.settings.musicVolume,
            musicDuck: short.settings.musicDuck,
            narrationPath: short.narrationPath && existsSync(short.narrationPath) ? short.narrationPath : null,
            options: req.options
          },
          outPath
        )
        if (plan.captions.length > 0) {
          writeFileSync(
            join(workDir, 'captions.ass'),
            buildAss(plan.captions, plan.outputSize, {
              fontSize: short.settings.captionFontSize,
              marginV: Math.round(plan.outputSize.height * 0.16)
            })
          )
        }
        update(i, { status: 'encoding', progress: 0, outPath }, share(0), `Exporting ${label}…`)
        let lastPct = -1
        try {
          await runProcess(binPath('ffmpeg'), plan.args, {
            cwd: workDir,
            onSpawn: (c) => this.attachChild(c),
            onStdoutLine: (line) => {
              const m = /^out_time_us=(\d+)/.exec(line)
              if (m && plan.totalSec > 0) {
                const frac = Math.min(1, Number(m[1]) / 1e6 / plan.totalSec)
                const pct = Math.round(frac * 100)
                if (pct !== lastPct) {
                  lastPct = pct
                  update(i, { status: 'encoding', progress: pct }, share(frac), `Exporting ${label}…`)
                }
              }
            }
          })
        } catch (err) {
          rmSync(outPath, { force: true })
          throw err
        }
        update(i, { status: 'verifying', progress: 100 }, share(1), `Checking ${label}…`)
        const probe = await verifyExport(outPath, plan.totalSec)
        this.deps.store.setShortExport(short.id, outPath)
        // The finished file joins the project's library under Exports, so it can be previewed or reused.
        this.deps.store.addMediaAssets(project.id, [
          {
            id: randomUUID(),
            name: basename(outPath),
            kind: 'export',
            path: outPath,
            probe,
            proxyPath: null,
            createdAt: new Date().toISOString()
          }
        ])
        exported.push(outPath)
        update(i, { status: 'done', progress: 100 }, share(1), `Finished ${label}`)
      }
      this.finish(job, 'completed', null, `Exported ${exported.length} short${exported.length === 1 ? '' : 's'}.`, items)
    } catch (err) {
      // Shorts finished before the failure stay exported and valid; only the in-flight file is removed.
      const stopped = err instanceof ProcessCancelledError || Boolean(signal?.aborted)
      // The short that was running gets the outcome; any short after it never started.
      items = items.map((it, j) => {
        if (j < current || it.status === 'done') return it
        if (j === current) return { ...it, status: stopped ? 'cancelled' : 'failed' }
        return { ...it, status: 'cancelled' }
      })
      if (stopped) {
        this.finish(job, 'cancelled', null, 'Export cancelled. Partial file removed.', items)
      } else {
        this.finish(job, 'failed', (err as Error).message, 'Export failed.', items)
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
}

/** FFmpeg args for a 720p H.264/AAC preview. Audio is optional so silent sources still work. */
export function buildProxyArgs(input: string, output: string): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-progress',
    'pipe:1',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    'scale=-2:720',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    output
  ]
}

export function defaultSettings(ratio: Short['settings']['ratio']): Short['settings'] {
  return {
    ratio,
    framing: { x: 0.5, y: 0.5, mode: 'crop' },
    captionsEnabled: true,
    captionFontSize: 72,
    musicEnabled: false,
    musicVolume: 0.25,
    musicDuck: true
  }
}

/** Safe, human filename from a title. Never empty and never contains path separators. */
export function safeFileName(title: string): string {
  const cleaned = [...title]
    .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return cleaned || 'short'
}

/** Pick an output path that does not clobber existing files unless overwrite was confirmed. */
export function chooseOutputPath(dir: string, title: string, overwrite: boolean): string {
  const base = safeFileName(title)
  const first = join(dir, `${base}.mp4`)
  if (overwrite || !existsSync(first)) return first
  for (let n = 2; n < 1000; n++) {
    const candidate = join(dir, `${base} (${n}).mp4`)
    if (!existsSync(candidate)) return candidate
  }
  throw new Error('Too many files with this name in the output folder.')
}

/** Probe every export and check it is playable with the requested streams and roughly the length. */
export async function verifyExport(path: string, expectedSec: number): Promise<ProbeInfo> {
  const probe = await probeMedia(path)
  if (!probe.hasAudio) throw new Error(`Exported file has no audio stream: ${basename(path)}`)
  if (Math.abs(probe.durationSec - expectedSec) > 0.75) {
    throw new Error(
      `Exported duration ${probe.durationSec.toFixed(2)}s differs from the expected ${expectedSec.toFixed(2)}s`
    )
  }
  return probe
}
