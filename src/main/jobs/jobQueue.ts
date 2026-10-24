// The background job queue for media work. Lives in the main process, so jobs keep running when the
// renderer reloads; the renderer asks for the current list and follows change events.
// No Electron imports here, so it can be tested directly.
import { basename } from 'node:path'
import { isJobFinished, type JobKind, type JobSnapshot } from '@shared/media/jobs'
import type { MediaKind } from '@shared/project/schema'
import type { ProbeResult } from '@shared/media/probe'
import { UserFacingError } from '../errors'

export interface JobInput {
  path: string
  /** Folder the job writes its output into. Set for thumbnail and filmstrip jobs. */
  outDir?: string
  /** What kind of media the file is. Thumbnail jobs pick their output from it. */
  mediaKind?: MediaKind
  /** Length of the file in seconds. Filmstrip jobs need it to space their frames. */
  durationSec?: number
}

export interface JobContext {
  /** Aborted when the job is cancelled. Executors pass it on to any child process they run. */
  signal: AbortSignal
  /** Reports progress as a fraction from 0 to 1. Ignored once the job has finished. */
  reportProgress: (fraction: number) => void
}

/** What each kind of job resolves to. Kinds that only write files resolve to nothing. */
export interface JobResults {
  probe: ProbeResult
  thumbs: void
  filmstrip: void
  proxy: void
}

export type JobExecutors = {
  [K in JobKind]: (input: JobInput, ctx: JobContext) => Promise<JobResults[K]>
}

// Lower number runs first. Probing comes before the heavier work so the editor can show clip info.
export const JOB_PRIORITY: Record<JobKind, number> = { probe: 0, thumbs: 1, filmstrip: 2, proxy: 3 }

const JOB_TITLES: Record<JobKind, string> = {
  probe: 'Reading media info',
  thumbs: 'Making thumbnails',
  filmstrip: 'Making the filmstrip',
  proxy: 'Making a proxy file'
}

const DEFAULT_CONCURRENCY = 2
// Finished jobs stay listed so the renderer can show what just happened. Older ones are dropped.
const FINISHED_JOBS_KEPT = 50

export class JobCancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'JobCancelledError'
  }
}

interface Entry {
  seq: number
  input: JobInput
  snapshot: JobSnapshot
  controller: AbortController
  settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void }
}

export interface EnqueuedJob<K extends JobKind> {
  id: string
  /** Resolves with the job's result, or rejects with the failure or a JobCancelledError. */
  done: Promise<JobResults[K]>
}

export class JobQueue {
  private readonly entries = new Map<string, Entry>()
  private readonly listeners = new Set<(job: JobSnapshot) => void>()
  private sequence = 0
  private running = 0

  constructor(
    private readonly executors: JobExecutors,
    private readonly concurrency = DEFAULT_CONCURRENCY
  ) {}

  enqueue<K extends JobKind>(
    kind: K,
    path: string,
    extra: Omit<JobInput, 'path'> = {}
  ): EnqueuedJob<K> {
    this.sequence += 1
    const id = `job-${this.sequence}`
    let resolve!: (value: unknown) => void
    let reject!: (error: unknown) => void
    const done = new Promise<unknown>((res, rej) => {
      resolve = res
      reject = rej
    })
    // A cancelled job rejects here whether or not anyone awaits it, so a missing handler is not an error.
    done.catch(() => undefined)

    const entry: Entry = {
      seq: this.sequence,
      input: { path, ...extra },
      snapshot: { id, kind, label: basename(path), status: 'queued', progress: 0 },
      controller: new AbortController(),
      settle: { resolve, reject }
    }
    this.entries.set(id, entry)
    this.notify(entry)
    this.pump()
    return { id, done: done as Promise<JobResults[K]> }
  }

  /** Cancels a queued or running job. Returns false when the job is unknown or already finished. */
  cancel(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    if (entry.snapshot.status === 'queued') {
      this.settleEntry(entry, 'cancelled', new JobCancelledError())
      return true
    }
    if (entry.snapshot.status === 'running') {
      // The executor sees the abort and rejects; start() then settles the job as cancelled.
      entry.controller.abort()
      return true
    }
    return false
  }

  list(): JobSnapshot[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.snapshot }))
  }

  /** Calls the listener with a copy of the job on every status or progress change. */
  subscribe(listener: (job: JobSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const next = this.nextQueued()
      if (!next) return
      this.start(next)
    }
  }

  private nextQueued(): Entry | undefined {
    let best: Entry | undefined
    for (const entry of this.entries.values()) {
      if (entry.snapshot.status !== 'queued') continue
      if (!best || rank(entry) < rank(best)) best = entry
    }
    return best
  }

  private start(entry: Entry): void {
    this.running += 1
    this.update(entry, { status: 'running' })
    const { kind } = entry.snapshot
    const ctx: JobContext = {
      signal: entry.controller.signal,
      reportProgress: (fraction) => {
        if (entry.snapshot.status !== 'running' || !Number.isFinite(fraction)) return
        this.update(entry, { progress: Math.min(1, Math.max(0, fraction)) })
      }
    }
    const executor = this.executors[kind] as (input: JobInput, ctx: JobContext) => Promise<unknown>
    Promise.resolve()
      .then(() => executor(entry.input, ctx))
      .then(
        (value) =>
          this.settleEntry(entry, entry.controller.signal.aborted ? 'cancelled' : 'done', value),
        (error: unknown) =>
          this.settleEntry(entry, entry.controller.signal.aborted ? 'cancelled' : 'failed', error)
      )
  }

  private settleEntry(
    entry: Entry,
    status: 'done' | 'failed' | 'cancelled',
    outcome: unknown
  ): void {
    if (entry.snapshot.status === 'running') this.running -= 1
    const { kind } = entry.snapshot
    if (status === 'done') {
      this.update(entry, { status, progress: 1 })
      entry.settle.resolve(outcome)
    } else if (status === 'failed') {
      this.update(entry, { status, error: describeFailure(kind, outcome) })
      entry.settle.reject(outcome)
    } else {
      this.update(entry, { status })
      entry.settle.reject(new JobCancelledError())
    }
    this.pruneFinished()
    this.pump()
  }

  private pruneFinished(): void {
    const finished = [...this.entries.values()].filter((entry) =>
      isJobFinished(entry.snapshot.status)
    )
    for (const entry of finished.slice(0, Math.max(0, finished.length - FINISHED_JOBS_KEPT))) {
      this.entries.delete(entry.snapshot.id)
    }
  }

  private update(entry: Entry, patch: Partial<JobSnapshot>): void {
    entry.snapshot = { ...entry.snapshot, ...patch }
    this.notify(entry)
  }

  private notify(entry: Entry): void {
    for (const listener of this.listeners) listener({ ...entry.snapshot })
  }
}

function rank(entry: Entry): [number, number] {
  return [JOB_PRIORITY[entry.snapshot.kind], entry.seq]
}

// Failures from UserFacingError are already written for the user. Anything else gets a plain title,
// with the technical message kept for the details view.
function describeFailure(kind: JobKind, error: unknown): { message: string; details?: string } {
  if (error instanceof UserFacingError) return { message: error.message, details: error.details }
  return {
    message: `${JOB_TITLES[kind]} failed.`,
    details: error instanceof Error ? error.message : String(error)
  }
}

/** Executors for a build where the media tools are not wired up. Every job fails with a clear message. */
export function unavailableExecutors(): JobExecutors {
  const unavailable = (kind: JobKind) => async (): Promise<never> => {
    throw new UserFacingError(`${JOB_TITLES[kind]} is not available in this build.`)
  }
  return {
    probe: unavailable('probe'),
    thumbs: unavailable('thumbs'),
    filmstrip: unavailable('filmstrip'),
    proxy: unavailable('proxy')
  }
}
