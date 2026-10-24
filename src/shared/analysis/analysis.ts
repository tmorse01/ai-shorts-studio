// Analysis records for media items: the stages a clip goes through (transcript, shots, vision), and
// where each one is. Pure, so the state rules can be tested without the queue or the disk.
import { z } from 'zod'

export const ANALYSIS_STAGES = ['transcript', 'shots', 'vision'] as const
export const analysisStageSchema = z.enum(ANALYSIS_STAGES)
export type AnalysisStage = z.infer<typeof analysisStageSchema>

export const analysisStageStatusSchema = z.enum(['pending', 'running', 'done', 'failed', 'skipped'])
export type AnalysisStageStatus = z.infer<typeof analysisStageStatusSchema>

// What a stage runner reports when it finishes. 'skipped' means no provider is set up for the stage.
export type StageOutcome = 'done' | 'skipped'

const stageRecordSchema = z.object({
  status: analysisStageStatusSchema,
  error: z
    .object({
      message: z.string(),
      details: z.string().optional()
    })
    .optional()
})
export type AnalysisStageRecord = z.infer<typeof stageRecordSchema>

export const analysisRecordSchema = z.object({
  mediaId: z.string().min(1),
  // Starts at 1 and goes up on every re-analyze. A stage that finishes for an older version is ignored.
  version: z.number().int().positive(),
  stages: z.object({
    transcript: stageRecordSchema,
    shots: stageRecordSchema,
    vision: stageRecordSchema
  })
})
export type AnalysisRecord = z.infer<typeof analysisRecordSchema>

// The whole analysis file for one project: the per-project toggle and every media item's record.
export const analysisFileSchema = z.object({
  autoAnalyze: z.boolean(),
  records: z.record(z.string(), analysisRecordSchema)
})
export type AnalysisFile = z.infer<typeof analysisFileSchema>

export function emptyAnalysisFile(): AnalysisFile {
  return { autoAnalyze: true, records: {} }
}

function pendingStages(): AnalysisRecord['stages'] {
  return {
    transcript: { status: 'pending' },
    shots: { status: 'pending' },
    vision: { status: 'pending' }
  }
}

export function newAnalysisRecord(mediaId: string): AnalysisRecord {
  return { mediaId, version: 1, stages: pendingStages() }
}

/** A fresh version of the record with every stage pending again. */
export function reanalyzedRecord(record: AnalysisRecord): AnalysisRecord {
  return { mediaId: record.mediaId, version: record.version + 1, stages: pendingStages() }
}

/** After an app restart nothing is still running, so a stage left as running goes back to pending. */
export function recoverInterruptedStages(record: AnalysisRecord): AnalysisRecord {
  const stages = { ...record.stages }
  for (const stage of ANALYSIS_STAGES) {
    if (stages[stage].status === 'running') stages[stage] = { status: 'pending' }
  }
  return { ...record, stages }
}

/**
 * The stage to run next, in pipeline order. A failed stage stops the chain: later stages wait until
 * the user re-analyzes. Undefined when nothing is left to run.
 */
export function nextPendingStage(record: AnalysisRecord): AnalysisStage | undefined {
  for (const stage of ANALYSIS_STAGES) {
    const status = record.stages[stage].status
    if (status === 'failed') return undefined
    if (status === 'pending') return stage
  }
  return undefined
}

export function withStageStatus(
  record: AnalysisRecord,
  stage: AnalysisStage,
  status: AnalysisStageStatus,
  error?: AnalysisStageRecord['error']
): AnalysisRecord {
  return {
    ...record,
    stages: { ...record.stages, [stage]: error ? { status, error } : { status } }
  }
}

/** One word for the media card: failed beats running, then pending, then done. */
export function recordSummary(record: AnalysisRecord): AnalysisStageStatus {
  const statuses = ANALYSIS_STAGES.map((stage) => record.stages[stage].status)
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('running')) return 'running'
  if (statuses.includes('pending')) return 'pending'
  return 'done'
}
