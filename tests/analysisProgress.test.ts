import { describe, expect, it } from 'vitest'
import {
  newAnalysisRecord,
  withStageStatus,
  type AnalysisFile,
  type AnalysisRecord
} from '@shared/analysis/analysis'
import type { JobSnapshot } from '@shared/media/jobs'
import {
  analysisJobFor,
  analysisSummaryText,
  busyProgressLabel,
  isAnalysed,
  newlyFinishedMedia,
  progressPercent,
  stageRows
} from '@renderer/features/analysis/analysisProgress'
import { tileStatus } from '@renderer/features/media/mediaTileModel'

function job(extra: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: 'job-1',
    kind: 'analysis',
    label: 'bike-run.mp4',
    status: 'running',
    progress: 0.4,
    ...extra
  }
}

function fileWith(record: AnalysisRecord): AnalysisFile {
  return { autoAnalyze: true, records: { [record.mediaId]: record } }
}

function allDone(id = 'm1'): AnalysisRecord {
  let record = newAnalysisRecord(id)
  record = withStageStatus(record, 'transcript', 'done')
  record = withStageStatus(record, 'shots', 'done')
  return withStageStatus(record, 'vision', 'done')
}

describe('busy label and percentage', () => {
  it('names the running stage with its percentage', () => {
    const record = withStageStatus(newAnalysisRecord('m1'), 'shots', 'running')
    expect(busyProgressLabel(record, job({ progress: 0.4 }))).toBe('Finding shots… 40%')
  })

  it('shows the stage without a percentage while the job is only queued', () => {
    const record = withStageStatus(newAnalysisRecord('m1'), 'transcript', 'running')
    expect(busyProgressLabel(record, job({ status: 'queued' }))).toBe('Transcribing…')
  })

  it('reports no percentage for a job that is not running', () => {
    expect(progressPercent(job({ status: 'done', progress: 1 }))).toBeUndefined()
    expect(progressPercent(job({ progress: 0.666 }))).toBe(67)
  })

  it('finds the unfinished analysis job for a file by name', () => {
    const jobs = {
      'job-1': job(),
      'job-2': job({ id: 'job-2', kind: 'export', label: 'bike-run.mp4' }),
      'job-3': job({ id: 'job-3', label: 'other.mp4', status: 'running' }),
      'job-4': job({ id: 'job-4', status: 'done' })
    }
    expect(analysisJobFor(jobs, 'bike-run.mp4')?.id).toBe('job-1')
    expect(analysisJobFor(jobs, 'missing.mp4')).toBeUndefined()
  })
})

describe('tile status', () => {
  it('shows the busy label with the job percentage', () => {
    const record = withStageStatus(newAnalysisRecord('m1'), 'vision', 'running')
    expect(tileStatus(record, job({ progress: 0.5 }))).toEqual({
      kind: 'busy',
      label: 'Describing… 50%'
    })
  })

  it('marks a finished clip as analysed, and an all-skipped clip as not analysed', () => {
    expect(tileStatus(allDone())).toEqual({ kind: 'analysed' })
    const skipped = withStageStatus(
      withStageStatus(
        withStageStatus(newAnalysisRecord('m1'), 'transcript', 'skipped'),
        'shots',
        'skipped'
      ),
      'vision',
      'skipped'
    )
    expect(isAnalysed(skipped)).toBe(false)
    expect(tileStatus(skipped)).toEqual({ kind: 'none' })
  })

  it('keeps the failed reason on a failed stage', () => {
    const record = withStageStatus(newAnalysisRecord('m1'), 'shots', 'failed', {
      message: 'Finding shots failed.'
    })
    expect(tileStatus(record)).toEqual({ kind: 'failed', reason: 'Finding shots failed.' })
  })
})

describe('stage rows for the Analysis panel', () => {
  it('lists every stage with its status, percentage and error', () => {
    let record = withStageStatus(newAnalysisRecord('m1'), 'transcript', 'done')
    record = withStageStatus(record, 'shots', 'failed', { message: 'Could not read the video.' })
    const rows = stageRows(record)
    expect(rows.map((row) => [row.name, row.status])).toEqual([
      ['Transcript', 'done'],
      ['Shots', 'failed'],
      ['Descriptions', 'pending']
    ])
    expect(rows[1]?.error).toBe('Could not read the video.')
  })

  it('gives the running stage its percentage', () => {
    const record = withStageStatus(newAnalysisRecord('m1'), 'transcript', 'running')
    expect(stageRows(record, job({ progress: 0.25 }))[0]?.percent).toBe(25)
  })
})

describe('results summary', () => {
  it('reads the counts in the summary sentence', () => {
    expect(
      analysisSummaryText('bike-run.mp4', {
        transcriptLines: 42,
        shots: 18,
        tags: 9,
        moments: 12
      })
    ).toBe('Analysed bike-run.mp4: 42 transcript lines · 18 shots · 9 tags · 12 suggested moments')
  })

  it('uses the singular for a count of one', () => {
    expect(
      analysisSummaryText('a.mp4', { transcriptLines: 1, shots: 1, tags: 1, moments: 1 })
    ).toBe('Analysed a.mp4: 1 transcript line · 1 shot · 1 tag · 1 suggested moment')
  })

  it('reports a clip only when it finishes after busy work and a stage ran', () => {
    const running = fileWith(withStageStatus(newAnalysisRecord('m1'), 'transcript', 'running'))
    const finished = fileWith(allDone('m1'))
    expect(newlyFinishedMedia(running, finished)).toEqual(['m1'])
    expect(newlyFinishedMedia(finished, finished)).toEqual([])
    expect(newlyFinishedMedia(undefined, finished)).toEqual([])

    const skipped = fileWith(
      withStageStatus(
        withStageStatus(
          withStageStatus(newAnalysisRecord('m1'), 'transcript', 'skipped'),
          'shots',
          'skipped'
        ),
        'vision',
        'skipped'
      )
    )
    expect(newlyFinishedMedia(running, skipped)).toEqual([])
  })
})
