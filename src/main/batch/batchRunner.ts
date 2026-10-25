// Runs a batch: one analysis stage over many media items, each one a job on the media queue (#39).
// The runner owns the live state of each batch and reports every change. Status changes are saved
// through `save`, so a batch survives a restart. Progress is only reported, never saved.
// No Electron imports here, so it can be tested with a fake queue.
import { randomUUID } from 'node:crypto'
import type { AnalysisStage } from '@shared/analysis/analysis'
import type { GeneratedScript, ScriptRunInput } from '@shared/ai/scriptGeneration'
import {
  cancelBatchItem,
  createBatch,
  findBatchItem,
  isBatchItemRetryable,
  isBatchItemSettled,
  resetBatchItemsForRetry,
  updateBatchItem,
  type Batch,
  type BatchItem
} from '@shared/batch/batch'
import type { JobSnapshot } from '@shared/media/jobs'
import { UserFacingError } from '../errors'
import { JobCancelledError, type JobInput, type JobQueue } from '../jobs/jobQueue'

export type BatchQueue = Pick<JobQueue, 'enqueue' | 'cancel' | 'subscribe' | 'list'>

export interface BatchItemInput {
  /** The media id for an analysis item, or any unique id for a script item. The item id in the batch. */
  id: string
  /** The file the analysis job reads. Analysis items only. */
  path?: string
  /** The draft request a script item runs. Script items only. */
  request?: ScriptRunInput
}

export interface BatchRunnerOptions {
  queue: BatchQueue
  /** The output folder and result file for a stage. Matches what the analysis service uses. */
  jobExtras: (
    projectFolder: string,
    stage: AnalysisStage,
    mediaId: string
  ) => Pick<JobInput, 'outDir' | 'resultFile'>
  /** Reads a batch the runner does not hold, such as one saved before a restart. */
  load: (projectFolder: string, batchId: string) => Promise<Batch | undefined>
  /** Saves a batch to its project. Called on status changes, not on progress. */
  save: (projectFolder: string, batch: Batch) => Promise<void>
  /** Told on every change, progress included. */
  onChange?: (projectFolder: string, batch: Batch) => void
  /** Told when a save fails in the background, so the failure is not silent. */
  onSaveError?: (error: unknown) => void
  newId?: () => string
  now?: () => string
}

interface Run {
  projectFolder: string
  batch: Batch
  /** Current file path per analysis item, used when an item is retried. */
  paths: Map<string, string>
  /** The draft request per script item, used when an item is retried. */
  requests: Map<string, ScriptRunInput>
  /** The queue job each item is running as, while it is queued or running. */
  jobs: Map<string, string>
}

export class BatchRunner {
  private readonly runs = new Map<string, Run>()
  private readonly linkedItems = new Map<string, { batchId: string; itemId: string }>()
  private saving: Promise<void> = Promise.resolve()

  constructor(private readonly options: BatchRunnerOptions) {
    options.queue.subscribe((job) => this.onJobChanged(job))
  }

  /**
   * Starts a batch. Pass a stage for an analysis batch (each item needs a path), or leave it out for a
   * script batch (each item needs a request). Returns as soon as the batch is saved and queued.
   */
  async start(input: {
    projectFolder: string
    stage?: AnalysisStage
    items: BatchItemInput[]
  }): Promise<Batch> {
    const batch = createBatch({
      id: `batch-${(this.options.newId ?? randomUUID)()}`,
      stage: input.stage,
      mediaIds: input.items.map((item) => item.id),
      createdAt: (this.options.now ?? (() => new Date().toISOString()))()
    })
    const run: Run = {
      projectFolder: input.projectFolder,
      batch,
      paths: new Map(
        input.items.flatMap((item) => (item.path === undefined ? [] : [[item.id, item.path]]))
      ),
      requests: new Map(
        input.items.flatMap((item) => (item.request === undefined ? [] : [[item.id, item.request]]))
      ),
      jobs: new Map()
    }
    if (!batch.items.every((item) => hasInput(run, item.id))) {
      throw new UserFacingError('Each item in the batch needs its input.')
    }
    this.runs.set(batch.id, run)
    await this.options.save(run.projectFolder, run.batch)
    for (const item of batch.items) this.runItem(run, item.id)
    return run.batch
  }

  /** Cancels one item that is queued or running. Returns whether anything changed. */
  async cancel(
    projectFolder: string,
    batchId: string,
    itemId: string
  ): Promise<{ cancelled: boolean; batch: Batch }> {
    const run = await this.loadRun(projectFolder, batchId)
    const item = requireItem(run.batch, itemId)
    if (isBatchItemSettled(item.status)) return { cancelled: false, batch: run.batch }
    const jobId = run.jobs.get(itemId)
    if (jobId !== undefined) this.options.queue.cancel(jobId)
    this.commit(run, cancelBatchItem(run.batch, itemId), true)
    return { cancelled: true, batch: run.batch }
  }

  /**
   * Runs again the given items that failed or were cancelled. Items that are running or done are
   * skipped. `items` carries current file paths, since a batch saved before a restart keeps none.
   */
  async retry(
    projectFolder: string,
    batchId: string,
    items: BatchItemInput[]
  ): Promise<{ retried: string[]; batch: Batch }> {
    const run = await this.loadRun(projectFolder, batchId)
    for (const item of items) {
      if (!findBatchItem(run.batch, item.id)) continue
      if (item.path !== undefined) run.paths.set(item.id, item.path)
      if (item.request !== undefined) run.requests.set(item.id, item.request)
    }
    const retried = items
      .map((item) => findBatchItem(run.batch, item.id))
      .filter((item): item is BatchItem => item !== undefined && isBatchItemRetryable(item.status))
      .map((item) => item.id)
    const missingInput = retried.find((id) => !hasInput(run, id))
    if (missingInput !== undefined) {
      throw new UserFacingError(
        run.batch.kind === 'script'
          ? 'Retrying an item needs its draft request.'
          : 'Retrying an item needs its current file path.'
      )
    }
    if (retried.length === 0) return { retried, batch: run.batch }
    this.commit(run, resetBatchItemsForRetry(run.batch, retried), true)
    for (const id of retried) this.runItem(run, id)
    return { retried, batch: run.batch }
  }

  private runItem(run: Run, itemId: string): void {
    if (!hasInput(run, itemId)) return
    const job =
      run.batch.kind === 'script'
        ? this.enqueueScript(run, itemId)
        : this.enqueueAnalysis(run, itemId)
    run.jobs.set(itemId, job.id)
    this.linkedItems.set(job.id, { batchId: run.batch.id, itemId })
    const attempts = requireItem(run.batch, itemId).attempts + 1
    this.commit(
      run,
      updateBatchItem(run.batch, itemId, {
        status: 'queued',
        progress: 0,
        attempts,
        error: undefined
      }),
      false
    )
    // The queue may already have started the job during enqueue, before the link existed.
    const current = this.options.queue.list().find((snapshot) => snapshot.id === job.id)
    if (current) this.onJobChanged(current)

    job.done.then(
      (result: unknown) => this.settle(run, itemId, job.id, 'done', undefined, result),
      (error: unknown) =>
        error instanceof JobCancelledError
          ? this.settle(run, itemId, job.id, 'cancelled')
          : this.settle(run, itemId, job.id, 'failed', error)
    )
  }

  private enqueueAnalysis(run: Run, itemId: string) {
    const path = run.paths.get(itemId) ?? ''
    const stage = run.batch.stage
    if (stage === undefined) throw new Error('An analysis batch has no stage.')
    return this.options.queue.enqueue('analysis', path, {
      stage,
      ...this.options.jobExtras(run.projectFolder, stage, itemId)
    })
  }

  private enqueueScript(run: Run, itemId: string) {
    const request = run.requests.get(itemId)
    if (!request) throw new Error('A script item has no request.')
    return this.options.queue.enqueue('script', run.projectFolder, { scriptRequest: request })
  }

  private settle(
    run: Run,
    itemId: string,
    jobId: string,
    status: 'done' | 'failed' | 'cancelled',
    error?: unknown,
    scripts?: unknown
  ): void {
    this.linkedItems.delete(jobId)
    // A job that was replaced by a retry, or already settled, has nothing left to report.
    if (run.jobs.get(itemId) !== jobId) return
    run.jobs.delete(itemId)
    const item = findBatchItem(run.batch, itemId)
    if (!item || isBatchItemSettled(item.status)) return

    if (status === 'done') {
      const drafts = run.batch.kind === 'script' ? (scripts as GeneratedScript[]) : undefined
      this.commit(
        run,
        updateBatchItem(run.batch, itemId, {
          status,
          progress: 1,
          ...(drafts ? { scripts: drafts } : {})
        }),
        true
      )
    } else if (status === 'failed') {
      this.commit(
        run,
        updateBatchItem(run.batch, itemId, {
          status,
          progress: 0,
          error: describeFailure(error)
        }),
        true
      )
    } else {
      this.commit(run, updateBatchItem(run.batch, itemId, { status, progress: 0 }), true)
    }
  }

  private onJobChanged(job: JobSnapshot): void {
    const link = this.linkedItems.get(job.id)
    if (!link) return
    const run = this.runs.get(link.batchId)
    if (!run) return
    const item = findBatchItem(run.batch, link.itemId)
    if (!item || isBatchItemSettled(item.status)) return
    if (job.status !== 'running') return
    if (item.status === 'running' && item.progress === job.progress) return
    this.commit(
      run,
      updateBatchItem(run.batch, link.itemId, { status: 'running', progress: job.progress }),
      false
    )
  }

  private commit(run: Run, batch: Batch, persist: boolean): void {
    run.batch = batch
    this.options.onChange?.(run.projectFolder, batch)
    if (persist) this.queueSave(run.projectFolder, batch)
  }

  // Saves run one after another, so an older save can never land after a newer one.
  private queueSave(projectFolder: string, batch: Batch): void {
    this.saving = this.saving
      .then(() => this.options.save(projectFolder, batch))
      .catch((error: unknown) => this.options.onSaveError?.(error))
  }

  private async loadRun(projectFolder: string, batchId: string): Promise<Run> {
    const held = this.runs.get(batchId)
    if (held && held.projectFolder === projectFolder) return held
    const batch = await this.options.load(projectFolder, batchId)
    if (!batch) throw new UserFacingError('That batch was not found in this project.')
    const run: Run = {
      projectFolder,
      batch,
      paths: new Map(),
      requests: new Map(),
      jobs: new Map()
    }
    this.runs.set(batchId, run)
    return run
  }
}

// Script items run from their request, analysis items from their file path.
function hasInput(run: Run, itemId: string): boolean {
  return run.batch.kind === 'script' ? run.requests.has(itemId) : run.paths.has(itemId)
}

function requireItem(batch: Batch, itemId: string): BatchItem {
  const item = findBatchItem(batch, itemId)
  if (!item) throw new UserFacingError('That item is not in this batch.')
  return item
}

function describeFailure(error: unknown): { message: string; details?: string } {
  if (error instanceof UserFacingError) return { message: error.message, details: error.details }
  return {
    message: 'Analyzing the footage failed.',
    details: error instanceof Error ? error.message : String(error)
  }
}
