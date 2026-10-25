// AI suggestions for one clip: tags derived from the analysis (A-roll or B-roll, plus the top vision tags),
// and named candidate moments that Claude proposes from the transcript and shot descriptions. Suggestions
// never apply by themselves: the renderer shows them and the user accepts or dismisses each one. Pure, so
// the derivation, the alignment and the reply reader are tested without the API, the disk or the clock.
import { z } from 'zod'

// Vision tags suggested per clip, most frequent first. A-roll or B-roll is always considered on top.
export const SUGGESTION_TAG_LIMIT = 3
// Candidate moments kept per clip.
export const SUGGESTION_MOMENT_LIMIT = 8
// A candidate shorter or longer than this is not a useful moment.
export const MOMENT_MIN_MS = 3000
export const MOMENT_MAX_MS = 120000
// A candidate edge this close to a shot or sentence boundary snaps onto it.
export const SNAP_TOLERANCE_MS = 1500
export const MOMENT_MAX_TOKENS = 1200
// The transcript sent with the moment request is cut here, so a long clip stays inside one request.
const TRANSCRIPT_PROMPT_CHARS = 16000

export const momentSuggestionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().nonnegative(),
    note: z.string().trim().max(200).optional()
  })
  .refine((moment) => moment.outMs > moment.inMs, {
    message: 'outMs must be greater than inMs'
  })
export type MomentSuggestion = z.infer<typeof momentSuggestionSchema>

// What is kept on disk for one clip: the moments the last search found, and every key the user dismissed.
// Dismissed keys survive a re-analysis, so a dismissed suggestion does not come back.
export const suggestionsFileSchema = z.object({
  moments: z.array(momentSuggestionSchema),
  dismissed: z.array(z.string().min(1).max(200))
})
export type SuggestionsFile = z.infer<typeof suggestionsFileSchema>

export function emptySuggestionsFile(): SuggestionsFile {
  return { moments: [], dismissed: [] }
}

// What the renderer shows for a clip: the tag names and moments still open to accept or dismiss.
export const suggestionsOutputSchema = z.object({
  tags: z.array(z.string().min(1).max(40)),
  moments: z.array(momentSuggestionSchema)
})
export type SuggestionsOutput = z.infer<typeof suggestionsOutputSchema>

/** A tag name compared the way tags are matched: no spaces, no case. */
export function tagKey(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

export function tagSuggestionKey(name: string): string {
  return `tag:${tagKey(name)}`
}

export function momentSuggestionKey(range: { inMs: number; outMs: number }): string {
  return `moment:${range.inMs}-${range.outMs}`
}

/** Drops the suggestions whose keys the user dismissed. */
export function notDismissed<T>(
  items: readonly T[],
  dismissed: readonly string[],
  keyOf: (item: T) => string
): T[] {
  const gone = new Set(dismissed)
  return items.filter((item) => !gone.has(keyOf(item)))
}

export interface TagSource {
  /** True when the clip has speech, false when it has none, undefined when no transcript exists yet. */
  speech: boolean | undefined
  /** The vision tags of each described shot. */
  shotTags: readonly (readonly string[])[]
}

/**
 * The tag names suggested for a clip: "A-roll" when speech is present and "B-roll" when it is not, then
 * the most frequent vision tags. Nothing about speech is suggested until the transcript stage has run.
 */
export function deriveTagSuggestions(source: TagSource): string[] {
  const names: string[] = []
  if (source.speech === true) names.push('A-roll')
  if (source.speech === false) names.push('B-roll')

  const counts = new Map<string, { name: string; count: number; first: number }>()
  let order = 0
  for (const tags of source.shotTags) {
    for (const raw of tags) {
      const name = raw.trim().toLowerCase().slice(0, 40)
      if (name === '' || tagKey(name) === 'a-roll' || tagKey(name) === 'b-roll') continue
      const seen = counts.get(name)
      if (seen) seen.count += 1
      else counts.set(name, { name, count: 1, first: order++ })
    }
  }
  const top = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, SUGGESTION_TAG_LIMIT)
    .map((item) => item.name)

  return [...new Set([...names, ...top])]
}

/** One candidate moment as Claude proposed it, in seconds from the start of the clip. */
export interface MomentCandidate {
  name: string
  startSec: number
  endSec: number
  note?: string
}

export interface AlignInput {
  candidates: readonly MomentCandidate[]
  /** Shot ranges in seconds. */
  shots: readonly { startSec: number; endSec: number }[]
  /** Sentence or phrase ranges in milliseconds. */
  segments: readonly { startMs: number; endMs: number }[]
  /** The clip's length, when known. Candidates are kept inside it. */
  durationMs?: number
}

/**
 * Aligns candidates to the clip's cuts and sentences. Each edge moves onto the nearest shot or sentence
 * boundary within SNAP_TOLERANCE_MS. A candidate that is too short or too long after that is dropped, as
 * is one that repeats an earlier range. The result is capped at SUGGESTION_MOMENT_LIMIT.
 */
export function alignMoments(input: AlignInput): MomentSuggestion[] {
  const bounds = boundariesOf(input)
  const out: MomentSuggestion[] = []
  const seen = new Set<string>()
  for (const candidate of input.candidates) {
    if (out.length >= SUGGESTION_MOMENT_LIMIT) break
    if (!Number.isFinite(candidate.startSec) || !Number.isFinite(candidate.endSec)) continue
    const name = candidate.name.trim()
    if (name === '') continue

    let inMs = snap(Math.max(0, Math.round(candidate.startSec * 1000)), bounds)
    let outMs = snap(Math.max(0, Math.round(candidate.endSec * 1000)), bounds)
    if (input.durationMs !== undefined) {
      inMs = Math.min(inMs, input.durationMs)
      outMs = Math.min(outMs, input.durationMs)
    }
    const length = outMs - inMs
    if (length < MOMENT_MIN_MS || length > MOMENT_MAX_MS) continue

    const key = momentSuggestionKey({ inMs, outMs })
    if (seen.has(key)) continue
    seen.add(key)
    const note = candidate.note?.trim()
    out.push(note ? { name, inMs, outMs, note } : { name, inMs, outMs })
  }
  return out
}

function boundariesOf(input: AlignInput): number[] {
  const points = new Set<number>([0])
  if (input.durationMs !== undefined) points.add(input.durationMs)
  for (const shot of input.shots) {
    points.add(Math.round(shot.startSec * 1000))
    points.add(Math.round(shot.endSec * 1000))
  }
  for (const segment of input.segments) {
    points.add(segment.startMs)
    points.add(segment.endMs)
  }
  return [...points].filter((point) => Number.isFinite(point) && point >= 0).sort((a, b) => a - b)
}

function snap(value: number, bounds: readonly number[]): number {
  let best = value
  let bestDistance = SNAP_TOLERANCE_MS + 1
  for (const bound of bounds) {
    const distance = Math.abs(bound - value)
    if (distance < bestDistance) {
      best = bound
      bestDistance = distance
    }
  }
  return best
}

export interface MomentPromptInput {
  fileName: string
  segments: readonly { startMs: number; text: string }[]
  shots: readonly { shotIndex: number; startSec: number; endSec: number; description?: string }[]
}

/** The instructions, the transcript with timings, and the shot list. The reply is JSON only. */
export function buildMomentPrompt(input: MomentPromptInput): string {
  const transcript = transcriptLines(input.segments)
  const shots = input.shots.length
    ? input.shots
        .map((shot) => {
          const range = `${shot.startSec.toFixed(1)}s to ${shot.endSec.toFixed(1)}s`
          const what = shot.description ? `: ${shot.description}` : ''
          return `Shot ${shot.shotIndex} (${range})${what}`
        })
        .join('\n')
    : '(no shots)'
  return [
    'You find short-form clip candidates in one piece of footage for a vertical short video.',
    'Use only the transcript and the shot list below.',
    `Suggest up to ${SUGGESTION_MOMENT_LIMIT} self-contained moments of 10 to 60 seconds that would make a`,
    'strong short: a complete thought, a clear hook or a clear payoff. Start each moment at the start of a',
    'sentence and end it at the end of one. Give each a title of under 8 words and a one-sentence note on',
    'why it works. Times are seconds from the start of the clip.',
    'Reply with only a JSON array and no other text, in this form:',
    '[{"name": "...", "startSec": 12.5, "endSec": 41.0, "note": "..."}]',
    'If nothing is worth suggesting, reply with [].',
    '',
    `Clip: ${input.fileName}`,
    '',
    '<transcript>',
    transcript || '(no speech)',
    '</transcript>',
    '',
    '<shots>',
    shots,
    '</shots>'
  ].join('\n')
}

function transcriptLines(segments: MomentPromptInput['segments']): string {
  const lines: string[] = []
  let used = 0
  for (const segment of segments) {
    const line = `[${(segment.startMs / 1000).toFixed(1)}s] ${segment.text.trim()}`
    if (used + line.length > TRANSCRIPT_PROMPT_CHARS) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

const candidateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  note: z.string().trim().max(200).optional()
})

/**
 * Reads the candidates from a reply. The reply may wrap the array in a code fence or add text around it.
 * Entries that do not fit the shape are dropped. Undefined when no JSON array can be read at all.
 */
export function parseMomentReply(text: string): MomentCandidate[] | undefined {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) return undefined
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  const parsed = z.array(z.unknown()).safeParse(json)
  if (!parsed.success) return undefined
  const candidates: MomentCandidate[] = []
  for (const raw of parsed.data) {
    const item = candidateSchema.safeParse(raw)
    if (item.success) candidates.push(item.data)
  }
  return candidates
}
