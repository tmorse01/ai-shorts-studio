import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { dedupeCandidates, normalizeSegments, placeBackToBack, segmentsDuration, validateCuts, type Segment } from '../shared/timeline'

/** Current Sonnet model ID. Confirm against the claude-api docs if this is changed. */
export const ANTHROPIC_MODEL = 'claude-sonnet-5-5'

export interface FrameSample {
  index: number
  timeSec: number
  jpeg: Buffer
}

export interface CandidateWindow {
  index: number
  startSec: number
  endSec: number
}

export interface RankRequest {
  apiKey: string
  prompt: string
  count: number
  minSec: number
  maxSec: number
  durationSec: number
  candidates: CandidateWindow[]
  frames: FrameSample[]
  transcript: string | null
  signal?: AbortSignal
}

export interface SuggestedShort {
  title: string
  reason: string
  segments: Segment[]
  rank: number
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate_limit' | 'timeout' | 'cancelled' | 'malformed' | 'network'
  ) {
    super(message)
    this.name = 'AiError'
  }
}

const responseSchema = z.object({
  shorts: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        reason: z.string().min(1).max(500),
        segments: z
          .array(z.object({ startSec: z.number().finite(), endSec: z.number().finite() }))
          .min(1)
          .max(6)
      })
    )
    .max(5)
})

function buildPrompt(req: RankRequest): string {
  const windows = req.candidates
    .map((c) => `#${c.index}: ${c.startSec.toFixed(1)}s–${c.endSec.toFixed(1)}s`)
    .join('\n')
  const frames = req.frames.map((f) => `Frame for window near ${f.timeSec.toFixed(1)}s`).join('\n')
  return [
    `You are selecting short-form vertical video clips from a long source video that is ${req.durationSec.toFixed(0)} seconds long.`,
    `User request: ${req.prompt}`,
    `Return up to ${req.count} shorts. Each short must total between ${req.minSec} and ${req.maxSec} seconds across its segments, and may use 1 to 4 cuts (segments) drawn from the candidate windows below. Segments must not overlap.`,
    'Only use timestamps inside the candidate windows. Prefer moments with lead-in, action and follow-through.',
    'Silent frames give weak motion information: say so in the reason when the choice is uncertain. Do not invent confidence scores.',
    req.transcript
      ? `Transcript excerpts with timestamps (may be partial):\n${req.transcript}`
      : 'No transcript is available; judge from the frames only.',
    `Candidate windows:\n${windows}`,
    `Frame samples (in the order attached):\n${frames}`,
    'Respond with JSON only, no prose, in this exact shape: {"shorts":[{"title":"...","reason":"...","segments":[{"startSec":0,"endSec":12.5}]}]}'
  ].join('\n\n')
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new AiError('The model did not return JSON.', 'malformed')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AiError('The model returned malformed JSON.', 'malformed')
  }
}

/**
 * Ask Claude to rank candidate windows using sampled frames. Output is validated, clamped to the
 * source bounds, filtered by the duration rules, and de-duplicated before it is returned.
 */
export async function rankCandidates(req: RankRequest): Promise<SuggestedShort[]> {
  const client = new Anthropic({ apiKey: req.apiKey, maxRetries: 1, timeout: 120_000 })
  const content: Anthropic.ContentBlockParam[] = []
  for (const frame of req.frames) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: frame.jpeg.toString('base64') }
    })
  }
  content.push({ type: 'text', text: buildPrompt(req) })

  let text: string
  try {
    const message = await client.messages.create(
      { model: ANTHROPIC_MODEL, max_tokens: 3000, messages: [{ role: 'user', content }] },
      { signal: req.signal }
    )
    text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  } catch (err) {
    throw classifyError(err)
  }

  const parsed = responseSchema.safeParse(extractJson(text))
  if (!parsed.success) throw new AiError('The model response did not match the expected shape.', 'malformed')

  const ranked: SuggestedShort[] = []
  parsed.data.shorts.forEach((short, i) => {
    const segments = normalizeSegments(short.segments, req.durationSec)
    const total = segmentsDuration(segments)
    if (validateCuts(placeBackToBack(segments), total) !== null) return
    if (total < req.minSec || total > req.maxSec) return
    ranked.push({ title: short.title, reason: short.reason, segments, rank: i + 1 })
  })
  const spans = ranked.map((r) => ({
    ...r,
    startSec: r.segments[0].startSec,
    endSec: r.segments[r.segments.length - 1].endSec
  }))
  return dedupeCandidates(spans, 0.5)
    .slice(0, req.count)
    .map((s, i) => ({ title: s.title, reason: s.reason, segments: s.segments, rank: i + 1 }))
}

function classifyError(err: unknown): AiError {
  if (err instanceof AiError) return err
  const name = (err as { name?: string })?.name
  const status = (err as { status?: number })?.status
  if (name === 'AbortError') return new AiError('Analysis was cancelled.', 'cancelled')
  if (name === 'APIConnectionTimeoutError') return new AiError('The AI request timed out. Try again.', 'timeout')
  if (status === 401 || status === 403) {
    return new AiError('The Anthropic API key was rejected. Check it in Settings.', 'auth')
  }
  if (status === 429) return new AiError('Rate limited by the AI provider. Wait a minute and retry.', 'rate_limit')
  if (name === 'APIConnectionError') return new AiError('Could not reach the AI provider. Check your connection.', 'network')
  return new AiError(`AI request failed: ${(err as Error)?.message ?? 'unknown error'}`, 'network')
}
