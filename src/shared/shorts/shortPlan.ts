// Generating shorts from sources (Epic 16, #311, part a): the request the user sets, the reply Claude sends
// back, and the rules that turn a reply into proposed shorts. Each moment is snapped to the source's shot and
// sentence boundaries with the same aligner as the moment suggestions (#56). Pure, so the prompt, the reader,
// the snapping and the reuse rule are tested without the API, the disk or the clock.
import { z } from 'zod'
import { alignMoments } from '../analysis/suggestions'
import type { MomentSuggestion } from '../analysis/suggestions'
import { targetLengthSchema, type TargetLength } from '../project/schema'

const nonEmptyString = z.string().trim().min(1)

export const SHORTS_MAX_COUNT = 5
export const SHORTS_DEFAULT_COUNT = 3
export const SHORT_MOMENTS_MAX = 8
export const SHORT_MOMENTS_DEFAULT = { min: 4, max: 6 } as const
export const SHORT_SOURCES_MAX = 20
// Room for every short in one reply. Five shorts of eight moments fit well inside this.
export const SHORTS_MAX_TOKENS = 4000
// The transcript sent across all sources is cut here, so a large selection stays inside one request.
const TRANSCRIPT_PROMPT_CHARS = 40000
const SHOTS_PROMPT_LIMIT = 300

export const shortsRequestSchema = z.object({
  count: z.number().int().min(1).max(SHORTS_MAX_COUNT),
  momentsPerShort: z
    .object({
      min: z.number().int().min(1).max(SHORT_MOMENTS_MAX),
      max: z.number().int().min(1).max(SHORT_MOMENTS_MAX)
    })
    .refine((range) => range.min <= range.max, { message: 'min must not be greater than max' }),
  targetLength: targetLengthSchema,
  // The optional angle or topic, for example "the big jumps". Empty means no angle.
  angle: z.string().trim().max(200),
  // When on, a moment used in one short is not used again in a later short.
  avoidReuse: z.boolean()
})
export type ShortsRequest = z.infer<typeof shortsRequestSchema>

export const shortsSourceSchema = z.object({
  mediaId: nonEmptyString,
  fileName: nonEmptyString,
  durationMs: z.number().nonnegative().optional()
})

// A moment the project already has. The model is told about it, and a proposal that matches it is reused.
export const existingMomentInputSchema = z
  .object({
    mediaId: nonEmptyString,
    name: nonEmptyString,
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().nonnegative()
  })
  .refine((moment) => moment.outMs > moment.inMs, { message: 'outMs must be greater than inMs' })

export const generateShortsInputSchema = z.object({
  projectFolder: nonEmptyString,
  sources: z
    .array(shortsSourceSchema)
    .min(1)
    .max(SHORT_SOURCES_MAX)
    .refine((items) => new Set(items.map((item) => item.mediaId)).size === items.length, {
      message: 'Each source may be listed once.'
    }),
  existingMoments: z.array(existingMomentInputSchema).max(500),
  request: shortsRequestSchema
})
export type GenerateShortsInput = z.infer<typeof generateShortsInputSchema>

// One moment of a proposed short, snapped to the source. Times are source milliseconds.
export const generatedMomentSchema = z
  .object({
    mediaId: nonEmptyString,
    name: nonEmptyString,
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().nonnegative(),
    note: z.string().optional()
  })
  .refine((moment) => moment.outMs > moment.inMs, { message: 'outMs must be greater than inMs' })
export type GeneratedMoment = z.infer<typeof generatedMomentSchema>

export const generatedShortSchema = z.object({
  title: nonEmptyString.max(80),
  hook: z.string().trim().max(200),
  moments: z.array(generatedMomentSchema).min(1).max(SHORT_MOMENTS_MAX)
})
export type GeneratedShort = z.infer<typeof generatedShortSchema>

export const generatedShortsOutputSchema = z.object({
  shorts: z.array(generatedShortSchema)
})
export type GeneratedShortsOutput = z.infer<typeof generatedShortsOutputSchema>

// What the reader needs from each source: the transcript, the shot ranges with their descriptions, and the
// AI moment suggestions the user has not dismissed.
export interface ShortsSourceFootage {
  segments: { startMs: number; endMs: number; text: string }[]
  shots: { shotIndex: number; startSec: number; endSec: number; description?: string }[]
  suggestions: MomentSuggestion[]
}

// One reply moment, with times in seconds as the prompt asks. Checked item by item by the reader.
const proposedMomentSchema = z
  .object({
    mediaId: nonEmptyString,
    name: nonEmptyString.max(80),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    note: z.string().trim().max(200).optional().catch(undefined)
  })
  .refine((moment) => moment.endSec > moment.startSec)
export type ProposedMoment = z.infer<typeof proposedMomentSchema>

const proposedShortSchema = z.object({
  title: nonEmptyString.max(80),
  hook: z.string().trim().max(200).catch(''),
  moments: z.array(z.unknown())
})
export interface ProposedShort {
  title: string
  hook: string
  moments: ProposedMoment[]
}

/**
 * Reads the shorts from a reply. The reply may wrap the object in a code fence or add text around it.
 * A short with no readable moment is dropped, and so is a moment that does not fit the shape. Undefined when
 * no JSON object with a shorts list can be read at all.
 */
export function parseShortsReply(text: string): ProposedShort[] | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  const top = z.object({ shorts: z.array(z.unknown()) }).safeParse(json)
  if (!top.success) return undefined

  const shorts: ProposedShort[] = []
  for (const raw of top.data.shorts) {
    const parsed = proposedShortSchema.safeParse(raw)
    if (!parsed.success) continue
    const moments: ProposedMoment[] = []
    for (const item of parsed.data.moments.slice(0, SHORT_MOMENTS_MAX)) {
      const moment = proposedMomentSchema.safeParse(item)
      if (moment.success) moments.push(moment.data)
    }
    if (moments.length > 0) {
      shorts.push({ title: parsed.data.title, hook: parsed.data.hook, moments })
    }
  }
  return shorts
}

/**
 * Snaps each proposed moment to its source's shots and sentences, and drops moments that are too short or
 * too long after snapping, or that name a source the request did not send. A short left with no moments is
 * dropped. Nothing is kept in the project here.
 */
export function alignShortPlan(
  proposed: readonly ProposedShort[],
  footage: Readonly<Record<string, ShortsSourceFootage & { durationMs?: number }>>
): GeneratedShort[] {
  const shorts: GeneratedShort[] = []
  for (const short of proposed) {
    const moments: GeneratedMoment[] = []
    for (const moment of short.moments) {
      const source = footage[moment.mediaId]
      if (!source) continue
      const aligned = alignMoments({
        candidates: [
          {
            name: moment.name,
            startSec: moment.startSec,
            endSec: moment.endSec,
            ...(moment.note ? { note: moment.note } : {})
          }
        ],
        shots: source.shots,
        segments: source.segments.map((segment) => ({
          startMs: segment.startMs,
          endMs: segment.endMs
        })),
        ...(source.durationMs === undefined ? {} : { durationMs: source.durationMs })
      })
      const first = aligned[0]
      if (!first) continue
      moments.push({
        mediaId: moment.mediaId,
        name: first.name,
        inMs: first.inMs,
        outMs: first.outMs,
        ...(first.note ? { note: first.note } : {})
      })
    }
    if (moments.length > 0) {
      shorts.push({ title: short.title, hook: short.hook, moments })
    }
  }
  return shorts
}

export function momentReuseKey(
  moment: Pick<GeneratedMoment, 'mediaId' | 'inMs' | 'outMs'>
): string {
  return `${moment.mediaId}:${moment.inMs}-${moment.outMs}`
}

/**
 * The reuse rule. A moment listed twice in one short is always kept once. When avoidReuse is on, a moment
 * a short already uses is left out of every later short, and a short left empty is dropped. When it is off,
 * shorts may share moments.
 */
export function applyReusePolicy(
  shorts: readonly GeneratedShort[],
  avoidReuse: boolean
): GeneratedShort[] {
  const usedAcross = new Set<string>()
  const out: GeneratedShort[] = []
  for (const short of shorts) {
    const usedHere = new Set<string>()
    const moments: GeneratedMoment[] = []
    for (const moment of short.moments) {
      const key = momentReuseKey(moment)
      if (usedHere.has(key)) continue
      if (avoidReuse && usedAcross.has(key)) continue
      usedHere.add(key)
      moments.push(moment)
    }
    if (moments.length === 0) continue
    for (const key of usedHere) usedAcross.add(key)
    out.push({ ...short, moments })
  }
  return out
}

/** The total length of a short's moments, in milliseconds. */
export function shortLengthMs(short: Pick<GeneratedShort, 'moments'>): number {
  return short.moments.reduce((total, moment) => total + (moment.outMs - moment.inMs), 0)
}

/** Whether a length is under, within or over the target. Review shows this against the target. */
export function fitsTarget(lengthMs: number, target: TargetLength): 'under' | 'within' | 'over' {
  if (lengthMs < target.minSec * 1000) return 'under'
  if (lengthMs > target.maxSec * 1000) return 'over'
  return 'within'
}

export interface ShortsPromptSource {
  mediaId: string
  fileName: string
  footage: ShortsSourceFootage
}

export interface ShortsPromptInput {
  request: ShortsRequest
  sources: readonly ShortsPromptSource[]
  existingMoments: readonly { mediaId: string; name: string; inMs: number; outMs: number }[]
}

/** The instructions, the sources and the reply format. The reply is a JSON object only. */
export function buildShortsPrompt(input: ShortsPromptInput): string {
  const { request } = input
  const { min, max } = request.momentsPerShort
  const momentCount = min === max ? `${min}` : `${min} to ${max}`
  const lines: string[] = [
    'You plan short vertical videos from the footage described below. Use only these sources.',
    `Propose ${request.count} ${request.count === 1 ? 'short' : 'shorts'}. Each short has a title of under`,
    `8 words, a one-line hook, and an ordered list of ${momentCount} moments.`,
    'Each moment is one range of one source. Start it at the start of a sentence or a shot and end it at the',
    'end of one. A moment is 3 to 60 seconds. Aim for a total of about',
    `${request.targetLength.minSec} to ${request.targetLength.maxSec} seconds per short.`,
    request.angle ? `Angle: ${request.angle}` : 'Angle: none. Choose the strongest moments.',
    request.avoidReuse
      ? 'Do not use the same moment in more than one short.'
      : 'Moments may appear in more than one short.',
    'Reply with only a JSON object and no other text, in this form:',
    '{"shorts": [{"title": "...", "hook": "...", "moments": [{"mediaId": "...", "name": "...", "startSec": 12.5, "endSec": 30.0, "note": "..."}]}]}',
    'If nothing is worth a short, reply with {"shorts": []}.',
    ''
  ]

  let budget = TRANSCRIPT_PROMPT_CHARS
  for (const source of input.sources) {
    lines.push(`<source mediaId="${source.mediaId}" name="${source.fileName}">`)
    lines.push('<transcript>')
    for (const segment of source.footage.segments) {
      const text = segment.text.trim()
      if (text === '') continue
      const line = `[${(segment.startMs / 1000).toFixed(1)}s] ${text}`
      if (line.length > budget) break
      budget -= line.length + 1
      lines.push(line)
    }
    lines.push('</transcript>')
    lines.push('<shots>')
    for (const shot of source.footage.shots.slice(0, SHOTS_PROMPT_LIMIT)) {
      const what = shot.description ? `: ${shot.description}` : ''
      lines.push(
        `Shot ${shot.shotIndex} (${shot.startSec.toFixed(1)}s to ${shot.endSec.toFixed(1)}s)${what}`
      )
    }
    lines.push('</shots>')
    lines.push('<ai-suggestions>')
    for (const moment of source.footage.suggestions) {
      lines.push(
        `${moment.name} (${(moment.inMs / 1000).toFixed(1)}s to ${(moment.outMs / 1000).toFixed(1)}s)`
      )
    }
    lines.push('</ai-suggestions>')
    lines.push('</source>')
    lines.push('')
  }

  lines.push('<existing-moments>')
  for (const moment of input.existingMoments) {
    lines.push(
      `${moment.mediaId} "${moment.name}" (${(moment.inMs / 1000).toFixed(1)}s to ${(moment.outMs / 1000).toFixed(1)}s)`
    )
  }
  lines.push('</existing-moments>')
  return lines.join('\n')
}
