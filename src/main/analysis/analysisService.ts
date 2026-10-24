// Runs each media item's analysis stages in order (transcript, shots, vision) as analysis jobs on the
// shared job queue. It keeps the per-project records in step with the jobs and pauses while playback
// runs. Pure rules live in @shared/analysis/analysis; this class only wires them to the queue and disk.
import {
  newAnalysisRecord,
  nextPendingStage,
  reanalyzedRecord,
  recoverInterruptedStages,
  stageOutcomeOf,
  withShots,
  withStageStatus,
  type AnalysisFile,
  type AnalysisRecord,
  type AnalysisStage,
  type StageResult
} from '@shared/analysis/analysis'
import type { VisionAvailability } from '@shared/ai/aiSettings'
import type { VisionDecision } from '@shared/analysis/analysis'
import { JobCancelledError } from '../jobs/jobQueue'
import { UserFacingError } from '../errors'
import { logError } from '../errors/errorLog'
import { analysisFramesDir } from './frameCache'
import { visionResultPath } from './analysisFile'

export interface MediaTarget {
  id: string
  path: string
}

// The part of the job queue the service needs. Tests pass a fake; the app passes the real queue.
export interface AnalysisQueue {
  enqueue: (
    kind: 'analysis',
    path: string,
    extra: { stage: AnalysisStage; outDir?: string; resultFile?: string }
  ) => { id: string; done: Promise<StageResult> }
  cancel: (id: string) => boolean
  setHeld: (kind: 'analysis', held: boolean) => void
}

export interface AnalysisStorage {
  load: (projectFolder: string) => Promise<AnalysisFile>
  save: (projectFolder: string, file: AnalysisFile) => Promise<void>
}

export interface AnalysisChange {
  projectFolder: string
  file: AnalysisFile
}

// Decides whether the vision stage may run. Without it, vision runs like any other stage. The app
// passes one that checks the API key, the monthly cap and the project's cost answer.
export interface VisionPolicy {
  availability: () => VisionAvailability
}

export interface AnalysisServiceOptions {
  queue: AnalysisQueue
  storage: AnalysisStorage
  onChange?: (change: AnalysisChange) => void
  vision?: VisionPolicy
}

const STAGE_LABELS: Record<AnalysisStage, string> = {
  transcript: 'Transcribing',
  shots: 'Finding shots',
  vision: 'Describing the footage'
}

interface Inflight {
  jobId: string
  stage: AnalysisStage
  version: number
}

function keyOf(projectFolder: string, mediaId: string): string {
  return JSON.stringify([projectFolder, mediaId])
}

export class AnalysisService {
  private readonly state = new Map<string, AnalysisFile>()
  private readonly writes = new Map<string, Promise<void>>()
  private readonly inflight = new Map<string, Inflight>()
  // Media whose stage was interrupted by playback, waiting for playback to stop.
  private readonly resumable = new Map<string, { projectFolder: string; item: MediaTarget }>()
  // The media each project last synced. Used to resume after playback.
  private readonly targets = new Map<string, MediaTarget[]>()
  private paused = false

  constructor(private readonly options: AnalysisServiceOptions) {}

  /**
   * Makes sure every media item has a record. Stages left running by an earlier session go back to
   * pending. When the project has analysis turned on, the pending stages are queued.
   */
  async sync(projectFolder: string, media: readonly MediaTarget[]): Promise<AnalysisFile> {
    const file = await this.ensure(projectFolder)
    this.targets.set(projectFolder, [...media])
    const records = { ...file.records }
    for (const item of media) {
      const existing = records[item.id]
      if (!existing) {
        records[item.id] = newAnalysisRecord(item.id)
      } else if (!this.inflight.has(keyOf(projectFolder, item.id))) {
        records[item.id] = recoverInterruptedStages(existing)
      }
    }
    this.commit(projectFolder, { ...file, records })
    if (this.state.get(projectFolder)?.autoAnalyze) {
      for (const item of media) this.advance(projectFolder, item)
    }
    return this.state.get(projectFolder) ?? file
  }

  /** Turns the project's "Analyze automatically" toggle on or off. Turning it on queues pending work. */
  async setAutoAnalyze(
    projectFolder: string,
    enabled: boolean,
    media: readonly MediaTarget[]
  ): Promise<AnalysisFile> {
    const file = await this.ensure(projectFolder)
    this.commit(projectFolder, { ...file, autoAnalyze: enabled })
    return this.sync(projectFolder, media)
  }

  /**
   * Records the user's answer to the cost question for this project. Confirming starts the vision
   * stages that were waiting; skipping marks them skipped.
   */
  async setVisionDecision(projectFolder: string, decision: VisionDecision): Promise<AnalysisFile> {
    const file = await this.ensure(projectFolder)
    this.commit(projectFolder, { ...file, visionDecision: decision })
    for (const item of this.targets.get(projectFolder) ?? []) this.advance(projectFolder, item)
    return this.state.get(projectFolder) ?? file
  }

  /** Starts a media item over from its first stage. Any stage already running is cancelled. */
  async reanalyze(projectFolder: string, item: MediaTarget): Promise<AnalysisFile> {
    const file = await this.ensure(projectFolder)
    const key = keyOf(projectFolder, item.id)
    const running = this.inflight.get(key)
    if (running) {
      this.inflight.delete(key)
      this.options.queue.cancel(running.jobId)
    }
    this.resumable.delete(key)
    const current = file.records[item.id] ?? newAnalysisRecord(item.id)
    this.commit(projectFolder, {
      ...file,
      records: { ...file.records, [item.id]: reanalyzedRecord(current) }
    })
    this.rememberTarget(projectFolder, item)
    if (this.paused) this.resumable.set(key, { projectFolder, item })
    else this.advance(projectFolder, item)
    return this.state.get(projectFolder) ?? file
  }

  /** Called when playback starts or stops. Playing holds analysis; stopping lets it continue. */
  setPlaybackActive(active: boolean): void {
    if (active === this.paused) return
    this.paused = active
    this.options.queue.setHeld('analysis', active)
    if (active) return
    const waiting = [...this.resumable.values()]
    this.resumable.clear()
    for (const { projectFolder, item } of waiting) this.advance(projectFolder, item)
  }

  private async ensure(projectFolder: string): Promise<AnalysisFile> {
    const cached = this.state.get(projectFolder)
    if (cached) return cached
    const loaded = await this.options.storage.load(projectFolder)
    // Another call may have loaded the project while this one waited on the disk.
    const existing = this.state.get(projectFolder)
    if (existing) return existing
    this.state.set(projectFolder, loaded)
    return loaded
  }

  private rememberTarget(projectFolder: string, item: MediaTarget): void {
    const list = (this.targets.get(projectFolder) ?? []).filter((target) => target.id !== item.id)
    this.targets.set(projectFolder, [...list, item])
  }

  private currentRecord(projectFolder: string, mediaId: string): AnalysisRecord | undefined {
    return this.state.get(projectFolder)?.records[mediaId]
  }

  private setRecord(projectFolder: string, record: AnalysisRecord): void {
    const file = this.state.get(projectFolder)
    if (!file) return
    this.commit(projectFolder, { ...file, records: { ...file.records, [record.mediaId]: record } })
  }

  // Updates the in-memory file, tells the renderer, and writes to disk. Writes run one after another
  // per project, so the last change is the one left on disk.
  private commit(projectFolder: string, file: AnalysisFile): void {
    this.state.set(projectFolder, file)
    this.options.onChange?.({ projectFolder, file })
    const previous = this.writes.get(projectFolder) ?? Promise.resolve()
    const next = previous
      .then(() => this.options.storage.save(projectFolder, file))
      .catch((error: unknown) => {
        logError({
          occurredAt: new Date().toISOString(),
          source: 'main',
          context: 'analysis',
          summary: `Could not save analysis for ${projectFolder}: ${
            error instanceof Error ? error.message : String(error)
          }`
        })
      })
    this.writes.set(projectFolder, next)
  }

  // Queues the next pending stage of one media item, if nothing is already running for it.
  private advance(projectFolder: string, item: MediaTarget): void {
    if (this.paused) return
    const key = keyOf(projectFolder, item.id)
    if (this.inflight.has(key)) return
    const record = this.currentRecord(projectFolder, item.id)
    const stage = record ? nextPendingStage(record) : undefined
    if (!record || !stage) return

    if (
      stage === 'vision' &&
      this.options.vision &&
      !this.visionMayRun(projectFolder, item, record)
    ) {
      return
    }

    const outDir = analysisFramesDir(projectFolder, item.id)
    const resultFile = stage === 'vision' ? visionResultPath(projectFolder, item.id) : undefined
    const job = this.options.queue.enqueue('analysis', item.path, { stage, outDir, resultFile })
    this.inflight.set(key, { jobId: job.id, stage, version: record.version })
    this.setRecord(projectFolder, withStageStatus(record, stage, 'running'))
    job.done.then(
      (outcome) => this.onStageDone(projectFolder, item, job.id, outcome),
      (error: unknown) => this.onStageFailed(projectFolder, item, job.id, error)
    )
  }

  // Decides what happens to a pending vision stage before it is queued. Returns true when it may run.
  // Without a key or with the cap reached, the stage is skipped. Without an answer to the cost question
  // it waits, and the record stays pending until setVisionDecision is called.
  private visionMayRun(projectFolder: string, item: MediaTarget, record: AnalysisRecord): boolean {
    const availability = this.options.vision?.availability() ?? 'ready'
    const decision = this.state.get(projectFolder)?.visionDecision
    if (availability !== 'ready' || decision === 'skipped') {
      this.setRecord(projectFolder, withStageStatus(record, 'vision', 'skipped'))
      this.advance(projectFolder, item)
      return false
    }
    return decision === 'confirmed'
  }

  // Takes the job out of the in-flight map. Returns undefined when the job was already replaced (for
  // example by a re-analyze), so its late result is ignored.
  private claim(projectFolder: string, item: MediaTarget, jobId: string): Inflight | undefined {
    const key = keyOf(projectFolder, item.id)
    const current = this.inflight.get(key)
    if (!current || current.jobId !== jobId) return undefined
    this.inflight.delete(key)
    return current
  }

  private onStageDone(
    projectFolder: string,
    item: MediaTarget,
    jobId: string,
    result: StageResult
  ): void {
    const claimed = this.claim(projectFolder, item, jobId)
    if (!claimed) return
    const record = this.currentRecord(projectFolder, item.id)
    if (!record || record.version !== claimed.version) return
    let next = withStageStatus(record, claimed.stage, stageOutcomeOf(result))
    if (typeof result !== 'string' && result.shots) next = withShots(next, result.shots)
    this.setRecord(projectFolder, next)
    this.advance(projectFolder, item)
  }

  private onStageFailed(
    projectFolder: string,
    item: MediaTarget,
    jobId: string,
    error: unknown
  ): void {
    const claimed = this.claim(projectFolder, item, jobId)
    if (!claimed) return
    const record = this.currentRecord(projectFolder, item.id)
    if (!record || record.version !== claimed.version) return

    if (error instanceof JobCancelledError) {
      // Cancelled by playback: the stage goes back to pending and runs again when playback stops.
      this.setRecord(projectFolder, withStageStatus(record, claimed.stage, 'pending'))
      this.resumable.set(keyOf(projectFolder, item.id), { projectFolder, item })
      if (!this.paused) this.advance(projectFolder, item)
      return
    }

    const failure =
      error instanceof UserFacingError
        ? { message: error.message, details: error.details }
        : {
            message: `${STAGE_LABELS[claimed.stage]} failed.`,
            details: error instanceof Error ? error.message : String(error)
          }
    this.setRecord(projectFolder, withStageStatus(record, claimed.stage, 'failed', failure))
  }
}
