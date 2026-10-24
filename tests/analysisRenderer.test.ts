import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand'
import {
  emptyAnalysisFile,
  newAnalysisRecord,
  withStageStatus,
  type AnalysisRecord
} from '@shared/analysis/analysis'
import type { MediaRef } from '@shared/project/schema'
import { analysisStore } from '../src/renderer/features/analysis/analysisStore'
import {
  syncAnalysis,
  watchPlaybackForAnalysis
} from '../src/renderer/features/analysis/analysisSync'
import {
  analysisErrorText,
  analysisStatusLabel
} from '../src/renderer/features/analysis/analysisStatus'

function recordWith(stages: Partial<Record<'transcript' | 'shots' | 'vision', string>>) {
  let record: AnalysisRecord = newAnalysisRecord('clip-1')
  for (const [stage, status] of Object.entries(stages)) {
    record = withStageStatus(record, stage as 'transcript', status as 'done')
  }
  return record
}

describe('analysis status on media cards', () => {
  it('says what state the clip is in', () => {
    expect(analysisStatusLabel(newAnalysisRecord('c'))).toBe('Waiting to analyze')
    expect(analysisStatusLabel(recordWith({ transcript: 'running' }))).toBe('Analyzing')
    expect(
      analysisStatusLabel(recordWith({ transcript: 'done', shots: 'done', vision: 'done' }))
    ).toBe('Analyzed')
  })

  it('does not claim footage was analyzed when every stage was skipped', () => {
    const record = recordWith({ transcript: 'skipped', shots: 'skipped', vision: 'skipped' })
    expect(analysisStatusLabel(record)).toBe('Not analyzed yet')
  })

  it('shows the message of a failed stage', () => {
    const record = withStageStatus(newAnalysisRecord('c'), 'shots', 'failed', {
      message: 'Finding shots failed.'
    })
    expect(analysisStatusLabel(record)).toBe('Analysis failed')
    expect(analysisErrorText(record)).toBe('Finding shots failed.')
    expect(analysisErrorText(newAnalysisRecord('c'))).toBeUndefined()
  })
})

describe('analysis sync', () => {
  const media: MediaRef[] = [
    {
      id: 'clip-1',
      path: 'clip-1.mp4',
      pathKind: 'relative',
      fileName: 'clip-1.mp4',
      sizeBytes: 10,
      kind: 'video'
    }
  ]

  it('sends the media with paths resolved against the project, and stores the reply', async () => {
    const sent: unknown[] = []
    const file = emptyAnalysisFile()
    const api = {
      invoke: async (channel: string, input: unknown) => {
        sent.push({ channel, input })
        return { ok: true as const, data: { file } }
      }
    }

    await syncAnalysis(api as never, 'C:/projects/demo', media)

    expect(sent).toEqual([
      {
        channel: 'analysis:sync',
        input: {
          projectFolder: 'C:/projects/demo',
          items: [{ id: 'clip-1', path: 'C:/projects/demo/clip-1.mp4' }]
        }
      }
    ])
    expect(analysisStore.getState().filesByFolder['C:/projects/demo']).toEqual(file)
  })

  it('tells main when playback starts and stops', () => {
    const sent: unknown[] = []
    const api = {
      invoke: async (channel: string, input: unknown) => {
        sent.push({ channel, input })
        return { ok: true as const, data: input }
      }
    }
    const playback = createStore<{ playing: boolean }>()(() => ({ playing: false }))
    watchPlaybackForAnalysis(api as never, playback)

    playback.setState({ playing: true })
    playback.setState({ playing: false })

    expect(sent).toEqual([
      { channel: 'analysis:playback', input: { playing: true } },
      { channel: 'analysis:playback', input: { playing: false } }
    ])
  })
})
