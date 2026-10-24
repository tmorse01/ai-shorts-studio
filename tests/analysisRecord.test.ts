import { describe, expect, it } from 'vitest'
import {
  analysisFileSchema,
  newAnalysisRecord,
  nextPendingStage,
  recordSummary,
  recoverInterruptedStages,
  reanalyzedRecord,
  withStageStatus
} from '@shared/analysis/analysis'

describe('analysis records', () => {
  it('starts a new record at version 1 with every stage pending', () => {
    const record = newAnalysisRecord('clip-1')
    expect(record.version).toBe(1)
    expect(record.stages).toEqual({
      transcript: { status: 'pending' },
      shots: { status: 'pending' },
      vision: { status: 'pending' }
    })
  })

  it('picks stages in pipeline order and skips finished ones', () => {
    let record = newAnalysisRecord('clip-1')
    expect(nextPendingStage(record)).toBe('transcript')
    record = withStageStatus(record, 'transcript', 'skipped')
    expect(nextPendingStage(record)).toBe('shots')
    record = withStageStatus(record, 'shots', 'done')
    record = withStageStatus(record, 'vision', 'done')
    expect(nextPendingStage(record)).toBeUndefined()
  })

  it('stops the chain at a failed stage instead of running the stages after it', () => {
    const record = withStageStatus(newAnalysisRecord('clip-1'), 'transcript', 'failed', {
      message: 'Transcribing failed.'
    })
    expect(nextPendingStage(record)).toBeUndefined()
    expect(recordSummary(record)).toBe('failed')
  })

  it('goes up one version and sets every stage back to pending on re-analyze', () => {
    const done = withStageStatus(newAnalysisRecord('clip-1'), 'transcript', 'done')
    const again = reanalyzedRecord(done)
    expect(again.version).toBe(2)
    expect(again.stages.transcript.status).toBe('pending')
  })

  it('turns stages a restart left running back to pending', () => {
    const running = withStageStatus(newAnalysisRecord('clip-1'), 'shots', 'running')
    const recovered = recoverInterruptedStages(running)
    expect(recovered.stages.shots.status).toBe('pending')
  })

  it('summarises the record for a media card', () => {
    expect(recordSummary(newAnalysisRecord('clip-1'))).toBe('pending')
    expect(recordSummary(withStageStatus(newAnalysisRecord('c'), 'shots', 'running'))).toBe(
      'running'
    )
    const all = ['transcript', 'shots', 'vision'] as const
    let record = newAnalysisRecord('c')
    for (const stage of all) record = withStageStatus(record, stage, 'skipped')
    expect(recordSummary(record)).toBe('done')
  })

  it('validates a stored analysis file', () => {
    const file = { autoAnalyze: true, records: { 'clip-1': newAnalysisRecord('clip-1') } }
    expect(analysisFileSchema.safeParse(file).success).toBe(true)
    expect(analysisFileSchema.safeParse({ autoAnalyze: 'yes', records: {} }).success).toBe(false)
  })
})
