import { describe, expect, it } from 'vitest'
import {
  aiSettingsSchema,
  capStatus,
  costForUsage,
  DEFAULT_VISION_MODEL,
  defaultAiSettings,
  estimateVisionCost,
  formatUsd,
  monthKey,
  remainingUnderCap,
  usageForMonth,
  visionAvailabilityFor,
  type UsageRecord
} from '@shared/ai/aiSettings'

function record(at: string, costUsd: number, inputTokens = 0, outputTokens = 0): UsageRecord {
  return { at, model: 'claude-haiku-5-5', inputTokens, outputTokens, costUsd }
}

describe('cost math', () => {
  it('prices a request from its reported input and output tokens', () => {
    // Haiku: $0.10 per million input, $0.50 per million output.
    expect(costForUsage('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(0.1)
    expect(costForUsage('claude-haiku-5-5', { inputTokens: 0, outputTokens: 2_000_000 })).toBe(1)
  })

  it('prices Sonnet higher than Haiku for the same tokens', () => {
    const usage = { inputTokens: 10_000, outputTokens: 1_000 }
    expect(costForUsage('claude-sonnet-5-5', usage)).toBeGreaterThan(
      costForUsage('claude-haiku-5-5', usage)
    )
  })

  it('estimates a vision pass as shot count times the planning numbers', () => {
    expect(estimateVisionCost('claude-haiku-5-5', 0)).toBe(0)
    const one = estimateVisionCost('claude-haiku-5-5', 1)
    expect(estimateVisionCost('claude-haiku-5-5', 100)).toBeCloseTo(one * 100, 5)
  })

  it('defaults to Haiku with no cap', () => {
    expect(defaultAiSettings()).toEqual({
      visionModel: DEFAULT_VISION_MODEL,
      monthlySpendCapUsd: null
    })
    expect(DEFAULT_VISION_MODEL).toBe('claude-haiku-5-5')
  })

  it('rejects a cap of zero, a negative cap and a non-model', () => {
    const base = defaultAiSettings()
    expect(aiSettingsSchema.safeParse({ ...base, monthlySpendCapUsd: 0 }).success).toBe(false)
    expect(aiSettingsSchema.safeParse({ ...base, monthlySpendCapUsd: -5 }).success).toBe(false)
    expect(aiSettingsSchema.safeParse({ ...base, visionModel: 'gpt-4' }).success).toBe(false)
    expect(aiSettingsSchema.safeParse({ ...base, monthlySpendCapUsd: 25 }).success).toBe(true)
  })
})

describe('monthly cap', () => {
  it('is uncapped when no cap is set, however much was spent', () => {
    expect(capStatus(500, null)).toBe('uncapped')
    expect(remainingUnderCap(500, null)).toBeNull()
  })

  it('is within the cap below it and reached at it', () => {
    expect(capStatus(4.99, 5)).toBe('within')
    expect(capStatus(5, 5)).toBe('reached')
    expect(capStatus(6, 5)).toBe('reached')
  })

  it('reports what is left, never below zero', () => {
    expect(remainingUnderCap(1.25, 5)).toBe(3.75)
    expect(remainingUnderCap(7, 5)).toBe(0)
  })

  it('blocks vision without a key first, then at the cap', () => {
    expect(visionAvailabilityFor(false, 'uncapped')).toBe('no-key')
    expect(visionAvailabilityFor(false, 'reached')).toBe('no-key')
    expect(visionAvailabilityFor(true, 'within')).toBe('ready')
    expect(visionAvailabilityFor(true, 'reached')).toBe('capped')
  })
})

describe('usage accumulation', () => {
  const records = [
    record('2026-10-03T12:00:00.000Z', 0.25, 1000, 100),
    record('2026-10-20T08:30:00.000Z', 0.5, 2000, 200),
    record('2026-09-28T09:00:00.000Z', 9, 99999, 99999)
  ]

  it('sums tokens and dollars for the month only', () => {
    const month = monthKey(new Date('2026-10-15T00:00:00'))
    expect(month).toBe('2026-10')
    expect(usageForMonth(records, month)).toEqual({
      inputTokens: 3000,
      outputTokens: 300,
      costUsd: 0.75
    })
  })

  it('is zero for a month with no requests', () => {
    expect(usageForMonth(records, '2026-01')).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    })
  })

  it('formats money plainly, with a floor for tiny amounts', () => {
    expect(formatUsd(0.004)).toBe('<$0.01')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(12.5)).toBe('$12.50')
  })
})
