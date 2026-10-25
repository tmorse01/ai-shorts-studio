// The render queue (Epic 17, #152): starts exports of shorts on the media job queue, follows them, and
// records a short as Exported when its file is in place. Main reads each short from the project on disk
// and resolves its footage and settings, so the renderer only sends short ids. No Electron imports here;
// the handlers pass in the disk, shell and event functions.
import { dirname, join } from 'node:path'
import type { EnqueuedJob, JobQueue } from '../jobs/jobQueue'
import type { JobSnapshot } from '@shared/media/jobs'
import type { Project } from '@shared/project/schema'
import { resolveMediaPath } from '../media/mediaPaths'
import { EXPORTS_SUBDIR } from '../project/projectStorage'
import {
  DEFAULT_EXPORT_SETTINGS,
  exportFileName,
  exportPreset,
  renderExportName,
  type EncoderInfo,
  type ExportSettings
} from '@shared/export/exportSettings'
import { buildSrt } from '@shared/captions/srt'
import { renderEtaSec, type RenderJob } from '@shared/export/renderQueue'
import { setShortExported } from '@shared/export/shortExport'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import type { ExportJobInput } from './exportJob'
import { UserFacingError } from '../errors'

export interface ShortExportedEvent {
  projectFolder: string
  shortId: string
  exportedAt: string
}

export interface RenderQueueDeps {
  queue: JobQueue
  readProject: (projectFolder: string) => Promise<Project>
  /** Saves the project with one short marked Exported. Called when its file is in place. */
  writeProject: (projectFolder: string, project: Project) => Promise<void>
  readSettings: () => Promise<ExportSettings | null>
  encoder: () => EncoderInfo | null
  fileExists: (path: string) => Promise<boolean>
  /** Writes a text file, such as the SRT next to an export. Called only when a short has captions to save. */
  writeText: (path: string, text: string) => Promise<void>
  /** Opens Explorer on a path: the file when it is finished, otherwise its folder. */
  reveal: (path: string) => void
  onChange?: (jobs: RenderJob[]) => void
  onExported?: (event: ShortExportedEvent) => void
  /** Reports a failure that happens after the export itself finished, such as a failed project save. */
  onError?: (summary: string) => void
  now?: () => number
}

interface Tracked {
  jobId: string
  projectFolder: string
  shortId: string
  shortName: string
  outPath: string
  srt: SrtFile | null
  runningAt: number | null
}

interface SrtFile {
  path: string
  text: string
}

interface Plan {
  shortId: string
  shortName: string
  outPath: string
  srt: SrtFile | null
  input: ExportJobInput
}

export class RenderQueueService {
  private readonly tracked = new Map<string, Tracked>()
  private readonly now: () => number

  constructor(private readonly deps: RenderQueueDeps) {
    this.now = deps.now ?? (() => Date.now())
    deps.queue.subscribe((job) => this.onJob(job))
  }

  /** Every export the queue still holds, in the order they were started. */
  list(): RenderJob[] {
    const snapshots = new Map(this.deps.queue.list().map((job) => [job.id, job]))
    const jobs: RenderJob[] = []
    for (const [id, entry] of this.tracked) {
      const snapshot = snapshots.get(id)
      if (!snapshot) {
        this.tracked.delete(id)
        continue
      }
      jobs.push(toRenderJob(entry, snapshot, this.now()))
    }
    return jobs
  }

  /**
   * Queues one export per short. Nothing is queued unless every short can be exported, so a bad short
   * never leaves the others half started. Resolves with the queue's exports.
   */
  async start(projectFolder: string, shortIds: readonly string[]): Promise<RenderJob[]> {
    const encoder = this.deps.encoder()
    if (!encoder) {
      throw new UserFacingError('Export is still checking the encoder. Try again in a moment.')
    }
    const settings = (await this.deps.readSettings()) ?? DEFAULT_EXPORT_SETTINGS
    const project = await this.deps.readProject(projectFolder)
    const plans = await this.plan(projectFolder, project, settings, encoder, shortIds)
    for (const plan of plans) {
      const enqueued = this.deps.queue.enqueue('export', plan.outPath, { export: plan.input })
      this.trackAndFollow(enqueued, projectFolder, plan)
    }
    return this.list()
  }

  /** Cancels a queued or running export. Returns false for anything that is not an export in this list. */
  cancel(jobId: string): boolean {
    if (!this.tracked.has(jobId)) return false
    return this.deps.queue.cancel(jobId)
  }

  /** Opens Explorer on the export's file, or on its folder while it is not finished. */
  reveal(jobId: string): void {
    const entry = this.tracked.get(jobId)
    if (!entry) throw new UserFacingError('That export is no longer in the queue.')
    const snapshot = this.deps.queue.list().find((job) => job.id === jobId)
    this.deps.reveal(snapshot?.status === 'done' ? entry.outPath : dirname(entry.outPath))
  }

  private async plan(
    projectFolder: string,
    project: Project,
    settings: ExportSettings,
    encoder: EncoderInfo,
    shortIds: readonly string[]
  ): Promise<Plan[]> {
    const preset = exportPreset(settings.presetId)
    const outDir = settings.outputFolder ?? join(projectFolder, EXPORTS_SUBDIR)
    const media = new Map(project.media.map((ref) => [ref.id, ref]))
    const taken = new Set(this.activePaths())
    const plans: Plan[] = []
    for (const shortId of shortIds) {
      const short = project.shorts.find((item) => item.id === shortId)
      if (!short) throw new UserFacingError('A short in this export is no longer in the project.')
      if (timelineDurationMs(short.timeline) === 0) {
        throw new UserFacingError(`${short.name} has no clips to export.`)
      }
      const usedIds = new Set<string>()
      for (const track of short.timeline.tracks) {
        for (const clip of track.clips) if (clip.mediaId) usedIds.add(clip.mediaId)
      }
      const footage = [...usedIds].map((id) => {
        const ref = media.get(id)
        if (!ref) throw new UserFacingError('A clip uses footage that is no longer in the project.')
        return { id, path: resolveMediaPath(projectFolder, ref) }
      })
      const baseName = renderExportName(settings.namingTemplate, {
        project: project.name,
        short: short.name,
        index: project.shorts.indexOf(short) + 1,
        preset: preset.label
      })
      const { outPath, srtPath } = await this.freeOutputPath(
        outDir,
        baseName,
        taken,
        settings.includeSrt
      )
      taken.add(outPath)
      const captions = settings.includeSrt ? buildSrt(short.timeline) : ''
      plans.push({
        shortId,
        shortName: short.name,
        outPath,
        srt: captions === '' ? null : { path: srtPath, text: captions },
        input: {
          timeline: short.timeline,
          media: footage,
          encoder: encoder.encoder,
          fps: settings.fps,
          videoKbps: preset.videoKbps,
          audioKbps: preset.audioKbps,
          outPath
        }
      })
    }
    return plans
  }

  // The first name in the folder that no file, pending export or earlier plan in this batch uses. When an
  // SRT is written, its name must be free too, so an existing caption file is never overwritten.
  private async freeOutputPath(
    outDir: string,
    baseName: string,
    taken: ReadonlySet<string>,
    withSrt: boolean
  ): Promise<{ outPath: string; srtPath: string }> {
    const attempt = (name: string) => ({
      outPath: join(outDir, exportFileName(name)),
      srtPath: join(outDir, `${name}.srt`)
    })
    const isFree = async ({ outPath, srtPath }: { outPath: string; srtPath: string }) =>
      !taken.has(outPath) &&
      !(await this.deps.fileExists(outPath)) &&
      !(withSrt && (await this.deps.fileExists(srtPath)))
    let candidate = attempt(baseName)
    for (let copy = 2; !(await isFree(candidate)); copy += 1) {
      candidate = attempt(`${baseName} (${copy})`)
    }
    return candidate
  }

  private activePaths(): string[] {
    return [...this.tracked.values()].map((entry) => entry.outPath)
  }

  private trackAndFollow(enqueued: EnqueuedJob<'export'>, projectFolder: string, plan: Plan): void {
    const entry: Tracked = {
      jobId: enqueued.id,
      projectFolder,
      shortId: plan.shortId,
      shortName: plan.shortName,
      outPath: plan.outPath,
      srt: plan.srt,
      runningAt: null
    }
    // The queue may have started the job before this entry existed, so its running change went unseen.
    const started = this.deps.queue.list().find((job) => job.id === enqueued.id)
    if (started?.status === 'running') entry.runningAt = this.now()
    this.tracked.set(enqueued.id, entry)
    enqueued.done.then(
      () => this.recordExported(entry),
      // A failed or cancelled export shows in the queue; nothing is recorded for it.
      () => undefined
    )
  }

  private async recordExported(entry: Tracked): Promise<void> {
    const exportedAt = new Date(this.now()).toISOString()
    if (entry.srt) {
      // The caption file is a side output: a failure is reported, and the short is still recorded.
      try {
        await this.deps.writeText(entry.srt.path, entry.srt.text)
      } catch (error) {
        this.deps.onError?.(
          `Saving the captions for ${entry.shortName} failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    try {
      const project = await this.deps.readProject(entry.projectFolder)
      const updated = setShortExported(project, entry.shortId, exportedAt)
      if (updated) await this.deps.writeProject(entry.projectFolder, updated)
      this.deps.onExported?.({
        projectFolder: entry.projectFolder,
        shortId: entry.shortId,
        exportedAt
      })
    } catch (error) {
      this.deps.onError?.(
        `Recording the export of ${entry.shortName} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private onJob(job: JobSnapshot): void {
    if (job.kind !== 'export') return
    const entry = this.tracked.get(job.id)
    if (entry && job.status === 'running' && entry.runningAt === null) {
      entry.runningAt = this.now()
    }
    this.deps.onChange?.(this.list())
  }
}

function toRenderJob(entry: Tracked, snapshot: JobSnapshot, now: number): RenderJob {
  const running = snapshot.status === 'running' && entry.runningAt !== null
  return {
    id: entry.jobId,
    shortId: entry.shortId,
    shortName: entry.shortName,
    fileName: basenameOf(entry.outPath),
    status: snapshot.status,
    progress: snapshot.progress,
    etaSec: running ? renderEtaSec(snapshot.progress, now - (entry.runningAt ?? now)) : null,
    error: snapshot.error
  }
}

function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
