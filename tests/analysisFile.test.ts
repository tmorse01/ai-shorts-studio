import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyAnalysisFile, newAnalysisRecord } from '@shared/analysis/analysis'
import { loadAnalysisFile, saveAnalysisFile } from '../src/main/analysis/analysisFile'
import { analysisExecutor, skippedStageRunners } from '../src/main/analysis/stageRunners'
import { UserFacingError } from '../src/main/errors'

describe('analysis file storage', () => {
  it('saves and loads the analysis file inside the project folder', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'analysis-file-'))
    const file = { autoAnalyze: false, records: { 'clip-1': newAnalysisRecord('clip-1') } }

    await saveAnalysisFile(folder, file)

    expect(await loadAnalysisFile(folder)).toEqual(file)
  })

  it('starts empty with analysis on when no file exists yet', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'analysis-file-'))
    expect(await loadAnalysisFile(folder)).toEqual(emptyAnalysisFile())
  })

  it('treats a damaged file as empty instead of failing the project', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'analysis-file-'))
    mkdirSync(join(folder, 'analysis'))
    writeFileSync(join(folder, 'analysis', 'analysis.json'), '{ not json')
    expect(await loadAnalysisFile(folder)).toEqual(emptyAnalysisFile())
  })
})

describe('analysis executor', () => {
  const ctx = { signal: new AbortController().signal, reportProgress: () => undefined }

  it('sends each job to the runner for its stage', async () => {
    const calls: string[] = []
    const execute = analysisExecutor({
      transcript: async (path) => (calls.push(`transcript:${path}`), 'done'),
      shots: async () => 'skipped',
      vision: async () => 'skipped'
    })
    await expect(execute({ path: 'a.mp4', stage: 'transcript' }, ctx)).resolves.toBe('done')
    expect(calls).toEqual(['transcript:a.mp4'])
  })

  it('skips every stage until a provider is wired in', async () => {
    const execute = analysisExecutor(skippedStageRunners())
    await expect(execute({ path: 'a.mp4', stage: 'vision' }, ctx)).resolves.toBe('skipped')
  })

  it('fails a job that lost its stage', async () => {
    const execute = analysisExecutor(skippedStageRunners())
    await expect(execute({ path: 'a.mp4' }, ctx)).rejects.toBeInstanceOf(UserFacingError)
  })
})
