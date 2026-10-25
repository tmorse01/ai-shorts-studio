// Script drafting rules: what the user asks for, how the model's reply is read, and what a run is
// expected to cost. Pure, so the prompt, the parser and the estimate are tested without the API.
// The footage grounding comes from scriptContext.ts; this file only frames it and checks the reply.
import { z } from 'zod'
import { costForUsage, visionModelSchema, type VisionModel } from './aiSettings'
import { estimateTokens } from './scriptContext'

export const SCRIPT_MAX_COUNT = 5
// Room for every script in one reply. Five scripts of about 80 lines fit well inside this.
export const SCRIPT_MAX_TOKENS = 8000
// Planning numbers for the cost estimate. The real cost is counted from the reported token counts.
const PROMPT_OVERHEAD_TOKENS = 600
const TOKENS_PER_SCRIPT = 1000
// Planning numbers for the time estimate: a fixed setup cost and a per-script share of one reply.
const SETUP_SECONDS = 5
const SECONDS_PER_SCRIPT = 10

export const scriptRequestSchema = z.object({
  topic: z.string().trim().min(1).max(240),
  count: z.number().int().min(1).max(SCRIPT_MAX_COUNT),
  // Null when the user leaves the target length open.
  targetSeconds: z.number().int().min(5).max(900).nullable(),
  tone: z.string().trim().max(80),
  notes: z.string().trim().max(2000),
  // Whether scripts may draw on the same footage. Unset means they may (the default).
  reuseFootage: z.boolean().optional()
})
export type ScriptRequest = z.infer<typeof scriptRequestSchema>

export const scriptMediaSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[A-Za-z0-9_-]+$/),
      fileName: z.string().min(1).max(260)
    })
  )
  .max(500)

export const scriptRunInputSchema = z.object({
  projectFolder: z.string().trim().min(1),
  media: scriptMediaSchema,
  request: scriptRequestSchema
})
export type ScriptRunInput = z.infer<typeof scriptRunInputSchema>

const generatedLineSchema = z.object({
  text: z.string().trim().min(1).max(400),
  beat: z.string().trim().max(80).optional(),
  footageHints: z.array(z.string().trim().min(1).max(120)).max(6).optional()
})

export const generatedScriptSchema = z.object({
  title: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(240),
  lines: z.array(generatedLineSchema).min(1).max(80)
})
export type GeneratedScript = z.infer<typeof generatedScriptSchema>

const generatedReplySchema = z.object({
  scripts: z.array(generatedScriptSchema).min(1).max(SCRIPT_MAX_COUNT)
})

export const scriptEstimateSchema = z.object({
  model: visionModelSchema,
  estimateUsd: z.number().nonnegative(),
  remainingUsd: z.number().nonnegative().nullable(),
  capStatus: z.enum(['uncapped', 'within', 'reached']),
  // What the footage contributed to the request, so the dialog can say what was used.
  transcriptUsed: z.number().int().nonnegative(),
  shotsUsed: z.number().int().nonnegative()
})
export type ScriptEstimate = z.infer<typeof scriptEstimateSchema>

/** The instructions and the grounding text, in the order the model reads them. */
export function buildScriptPrompt(request: ScriptRequest, groundingText: string): string {
  const length =
    request.targetSeconds === null
      ? 'Keep each script short enough for a vertical short.'
      : `Each script should read in about ${request.targetSeconds} seconds.`
  const reuse =
    request.reuseFootage === false && request.count > 1
      ? 'Do not use the same footage clip in more than one script. Spread the clips across the scripts.'
      : null
  const footage =
    groundingText.trim() === ''
      ? 'No footage notes were available. Write from the topic and notes only.'
      : groundingText
  return [
    `You write scripts for vertical short videos. Write ${request.count} ${
      request.count === 1 ? 'script' : 'scripts'
    } about the topic below.`,
    length,
    ...(reuse ? [reuse] : []),
    'Use the footage notes for facts and names. Do not invent people, places or events that the notes do not support.',
    'Each line is one spoken sentence. A footageHints entry names a clip from the notes, such as "clip.mp4, 0:12", and is optional.',
    'Reply with JSON only. No prose and no code fence. Use this shape:',
    '{"scripts":[{"title":"...","topic":"...","lines":[{"text":"...","beat":"...","footageHints":["..."]}]}]}',
    '',
    '<footage_and_brief>',
    footage,
    '</footage_and_brief>'
  ].join('\n')
}

/**
 * Reads the scripts from a model reply. The reply should be bare JSON, but the first object in the text
 * is taken, so a stray sentence or code fence does not lose the scripts. Null when nothing valid is found.
 */
export function parseScriptReply(text: string): GeneratedScript[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) return null
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const parsed = generatedReplySchema.safeParse(json)
  return parsed.success ? parsed.data.scripts : null
}

/** Planning estimate of how long one run takes, in seconds. Not a measured figure. */
export function estimateScriptSeconds(count: number): number {
  return SETUP_SECONDS + count * SECONDS_PER_SCRIPT
}

/** Estimated dollars for one run: the grounding and prompt in, the requested scripts out. */
export function estimateScriptCostUsd(
  model: VisionModel,
  groundingText: string,
  count: number
): number {
  return costForUsage(model, {
    inputTokens: estimateTokens(groundingText) + PROMPT_OVERHEAD_TOKENS,
    outputTokens: count * TOKENS_PER_SCRIPT
  })
}
