import { describe, expect, it } from 'vitest'
import { emptyAnalysisFile, newAnalysisRecord, type AnalysisFile } from '@shared/analysis/analysis'
import type { AiStatus } from '@shared/ai/aiSettings'
import {
  capLine,
  keyLine,
  parseCapInput,
  pendingVisionPass,
  usageLine
} from '../src/renderer/features/ai/aiText'

function status(overrides: Partial<AiStatus> = {}): AiStatus {
  return {
    settings: { visionModel: 'claude-haiku-5-5', monthlySpendCapUsd: null },
    hasKey: true,
    keyStorageAvailable: true,
    month: '2026-10',
    usage: { inputTokens: 1200, outputTokens: 300, costUsd: 0.0003 },
    capStatus: 'uncapped',
    ...overrides
  }
}

describe('AI settings wording', () => {
  it('says there is no cap when none is set', () => {
    expect(capLine(status())).toBe('No monthly cap is set.')
  })

  it('shows what is left under a cap', () => {
    const line = capLine(
      status({
        settings: { visionModel: 'claude-haiku-5-5', monthlySpendCapUsd: 5 },
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 1.25 },
        capStatus: 'within'
      })
    )
    expect(line).toBe('$3.75 left under the $5.00 monthly cap.')
  })

  it('says vision is paused when the cap is reached', () => {
    const line = capLine(
      status({
        settings: { visionModel: 'claude-haiku-5-5', monthlySpendCapUsd: 5 },
        capStatus: 'reached'
      })
    )
    expect(line).toContain('Vision is paused')
  })

  it('reports the key state without the key', () => {
    expect(keyLine(status({ hasKey: false }))).toBe('No key is saved yet.')
    expect(keyLine(status({ keyStorageAvailable: false }))).toContain('not available')
  })

  it('reads this month usage from the reported tokens', () => {
    expect(usageLine(status())).toBe('1,200 input and 300 output tokens, about <$0.01')
  })
})

describe('parseCapInput', () => {
  it('reads blank as no cap, a number as the cap, and junk as invalid', () => {
    expect(parseCapInput('   ')).toBeNull()
    expect(parseCapInput(' 12.5 ')).toBe(12.5)
    expect(parseCapInput('0')).toBeUndefined()
    expect(parseCapInput('-3')).toBeUndefined()
    expect(parseCapInput('lots')).toBeUndefined()
  })
})

describe('pendingVisionPass', () => {
  it('finds the first project waiting on the cost answer', () => {
    let record = newAnalysisRecord('clip-1')
    record = {
      ...record,
      stages: {
        transcript: { status: 'skipped' },
        shots: { status: 'done' },
        vision: { status: 'pending' }
      },
      shots: [
        { startSec: 0, endSec: 2 },
        { startSec: 2, endSec: 6 }
      ]
    }
    const waiting: AnalysisFile = { ...emptyAnalysisFile(), records: { 'clip-1': record } }
    const answered: AnalysisFile = { ...waiting, visionDecision: 'skipped' }

    expect(pendingVisionPass({ '/a': emptyAnalysisFile(), '/b': waiting })).toEqual({
      folderPath: '/b',
      shots: 2
    })
    expect(pendingVisionPass({ '/b': answered })).toBeUndefined()
  })
})
