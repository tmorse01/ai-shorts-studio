// Cloud AI settings, usage and cost rules. Pure, so main and renderer agree on the numbers and the
// rules can be tested without the API, the disk or Electron. The key itself is never in this file:
// it lives in the encrypted secret store in main.
import { z } from 'zod'

export const VISION_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const
export const visionModelSchema = z.enum(VISION_MODELS)
export type VisionModel = z.infer<typeof visionModelSchema>
export const DEFAULT_VISION_MODEL: VisionModel = 'claude-haiku-5-5'

export const VISION_MODEL_LABELS: Record<VisionModel, string> = {
  'claude-haiku-5-5': 'Haiku 5.5 (default)',
  'claude-sonnet-5-5': 'Sonnet 5.5'
}

// USD per million tokens, Anthropic first-party rates for prompts up to 100K tokens. Vision requests
// per shot are far below that, so the higher tier is not modelled.
export const MODEL_PRICE_PER_MTOK: Record<VisionModel, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 }
}

// Planning numbers for the cost estimate shown before a project's first vision pass. The real cost of
// each request is computed from the token counts the API reports, never from these.
export const ESTIMATED_TOKENS_PER_SHOT = { input: 1500, output: 200 } as const

const MAX_CAP_USD = 100000

export const aiSettingsSchema = z.object({
  visionModel: visionModelSchema,
  // Null means no cap. Vision pauses once the month's spend reaches it.
  monthlySpendCapUsd: z.number().positive().max(MAX_CAP_USD).nullable()
})
export type AiSettings = z.infer<typeof aiSettingsSchema>

export function defaultAiSettings(): AiSettings {
  return { visionModel: DEFAULT_VISION_MODEL, monthlySpendCapUsd: null }
}

export const usageRecordSchema = z.object({
  // ISO time the request finished.
  at: z.iso.datetime(),
  model: visionModelSchema,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative()
})
export type UsageRecord = z.infer<typeof usageRecordSchema>

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/** Dollar cost of one request, from the token counts the API reported. */
export function costForUsage(model: VisionModel, usage: TokenUsage): number {
  const price = MODEL_PRICE_PER_MTOK[model]
  const cost = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000
  return Math.round(cost * 1e6) / 1e6
}

/** Estimated dollar cost of a vision pass over `shotCount` shots. */
export function estimateVisionCost(model: VisionModel, shotCount: number): number {
  return costForUsage(model, {
    inputTokens: shotCount * ESTIMATED_TOKENS_PER_SHOT.input,
    outputTokens: shotCount * ESTIMATED_TOKENS_PER_SHOT.output
  })
}

/** The calendar month a moment falls in, in local time, as YYYY-MM. Spend resets each month. */
export function monthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

export interface MonthUsage extends TokenUsage {
  costUsd: number
}

/** Total tokens and dollars for the records that fall in `month`. */
export function usageForMonth(records: UsageRecord[], month: string): MonthUsage {
  const total: MonthUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  for (const record of records) {
    if (monthKey(new Date(record.at)) !== month) continue
    total.inputTokens += record.inputTokens
    total.outputTokens += record.outputTokens
    total.costUsd += record.costUsd
  }
  total.costUsd = Math.round(total.costUsd * 1e6) / 1e6
  return total
}

export type CapStatus = 'uncapped' | 'within' | 'reached'

/** Whether this month's spend has reached the cap. */
export function capStatus(spentUsd: number, capUsd: number | null): CapStatus {
  if (capUsd === null) return 'uncapped'
  return spentUsd >= capUsd ? 'reached' : 'within'
}

/** Dollars left under the cap, or null when there is no cap. Never negative. */
export function remainingUnderCap(spentUsd: number, capUsd: number | null): number | null {
  if (capUsd === null) return null
  return Math.max(0, Math.round((capUsd - spentUsd) * 1e6) / 1e6)
}

/** Plain-language money for the settings readout and the cost dialog. */
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return '<$0.01'
  return `$${amount.toFixed(2)}`
}

export const aiStatusSchema = z.object({
  settings: aiSettingsSchema,
  // Whether an API key is saved. The key itself is never sent to the renderer.
  hasKey: z.boolean(),
  // False when the OS keychain is unavailable, so a key cannot be stored safely.
  keyStorageAvailable: z.boolean(),
  // The current month, YYYY-MM, and what it has cost so far.
  month: z.string().regex(/^\d{4}-\d{2}$/),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative()
  }),
  capStatus: z.enum(['uncapped', 'within', 'reached'])
})
export type AiStatus = z.infer<typeof aiStatusSchema>

export const visionEstimateSchema = z.object({
  model: visionModelSchema,
  shotCount: z.number().int().nonnegative(),
  estimateUsd: z.number().nonnegative(),
  // Dollars left under the cap, or null when there is no cap.
  remainingUsd: z.number().nonnegative().nullable(),
  capStatus: z.enum(['uncapped', 'within', 'reached'])
})
export type VisionEstimate = z.infer<typeof visionEstimateSchema>
