// Plain-language progress and results for analysis: the stage a clip is in, its percentage, the rows of
// the Analysis panel, and the summary toast. Pure, so the wording and the rules are tested without React.
import {
  ANALYSIS_STAGES,
  recordSummary,
  type AnalysisFile,
  type AnalysisRecord,
  type AnalysisStage,
  type AnalysisStageStatus
} from '@shared/analysis/analysis'
import type { JobSnapshot } from '@shared/media/jobs'
import { analysisStatusLabel } from './analysisStatus'

export const STAGE_PROGRESS_LABELS: Record<AnalysisStage, string> = {
  transcript: 'Transcribing…',
  shots: 'Finding shots…',
  vision: 'Describing…'
}

export const STAGE_NAMES: Record<AnalysisStage, string> = {
  transcript: 'Transcript',
  shots: 'Shots',
  vision: 'Descriptions'
}

/** The last part of a path, on either separator. Jobs carry the file name only. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** The unfinished analysis job for a media file, matched by file name. */
export function analysisJobFor(
  jobs: Readonly<Record<string, JobSnapshot>>,
  fileName: string
): JobSnapshot | undefined {
  return Object.values(jobs).find(
    (job) =>
      job.kind === 'analysis' &&
      job.label === fileName &&
      (job.status === 'queued' || job.status === 'running')
  )
}

/** The percentage of the job, when it is running. Undefined otherwise. */
export function progressPercent(job: JobSnapshot | undefined): number | undefined {
  if (!job || job.status !== 'running') return undefined
  return Math.round(job.progress * 100)
}

/** The busy label for a tile, for example "Finding shots… 40%". Also used as the tile's tooltip. */
export function busyProgressLabel(record: AnalysisRecord, job?: JobSnapshot): string {
  const stage = ANALYSIS_STAGES.find((name) => record.stages[name].status === 'running')
  // Nothing has started yet: keep the plain "waiting" wording.
  if (!stage) return analysisStatusLabel(record)
  // No job on the queue yet (for example a restart): say only that analysis is going on.
  if (!job) return 'Analyzing'
  const percent = progressPercent(job)
  const base = STAGE_PROGRESS_LABELS[stage]
  return percent === undefined ? base : `${base} ${percent}%`
}

export interface StageRow {
  stage: AnalysisStage
  name: string
  status: AnalysisStageStatus
  percent?: number
  error?: string
}

/** One row per stage for the Analysis panel. The running stage carries the job's percentage. */
export function stageRows(record: AnalysisRecord, job?: JobSnapshot): StageRow[] {
  return ANALYSIS_STAGES.map((stage) => {
    const entry = record.stages[stage]
    const row: StageRow = { stage, name: STAGE_NAMES[stage], status: entry.status }
    if (entry.status === 'running') {
      const percent = progressPercent(job)
      if (percent !== undefined) row.percent = percent
    }
    if (entry.error) row.error = entry.error.message
    return row
  })
}

/** Counts the summary toast reports for one clip. */
export interface AnalysisCounts {
  transcriptLines: number
  shots: number
  tags: number
  moments: number
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "Analysed bike-run.mp4: 42 transcript lines · 18 shots · 9 tags · 12 suggested moments". */
export function analysisSummaryText(fileName: string, counts: AnalysisCounts): string {
  const parts = [
    plural(counts.transcriptLines, 'transcript line', 'transcript lines'),
    plural(counts.shots, 'shot', 'shots'),
    plural(counts.tags, 'tag', 'tags'),
    plural(counts.moments, 'suggested moment', 'suggested moments')
  ]
  return `Analysed ${fileName}: ${parts.join(' · ')}`
}

/**
 * The media ids whose analysis just finished in this change: busy before, done now, and at least one
 * stage actually ran (a clip with every stage skipped has nothing to report).
 */
export function newlyFinishedMedia(
  previous: AnalysisFile | undefined,
  next: AnalysisFile
): string[] {
  const finished: string[] = []
  for (const record of Object.values(next.records)) {
    const before = previous?.records[record.mediaId]
    if (!before || before.version !== record.version) continue
    const wasBusy = ['running', 'pending'].includes(recordSummary(before))
    if (!wasBusy || recordSummary(record) !== 'done') continue
    const anyRan = ANALYSIS_STAGES.some((stage) => record.stages[stage].status === 'done')
    if (anyRan) finished.push(record.mediaId)
  }
  return finished
}

/** Whether a record shows the 'analysed' mark: every stage has finished and at least one ran. */
export function isAnalysed(record: AnalysisRecord): boolean {
  return (
    recordSummary(record) === 'done' &&
    ANALYSIS_STAGES.some((stage) => record.stages[stage].status === 'done')
  )
}
