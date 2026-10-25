// Matches script lines to footage (Epic 15, #138). Each line's words are looked up in the search index
// (#55) for candidate clips. The model ranks them and picks in and out points, and each pick is snapped
// to shot boundaries (#51) and kept between 3 and 6 seconds. The result is an assembly plan (#137).
// Pure, so the candidates, the prompt, the reply reader and the snapping are tested without the API.
import { z } from 'zod'
import type { ShotRange } from '../analysis/analysis'
import type { VisionModel } from '../ai/aiSettings'
import { costForUsage } from '../ai/aiSettings'
import { estimateTokens } from '../ai/scriptContext'
import {
  queryTermsOf,
  type SearchHit,
  type SearchIndex,
  type SearchKind
} from '../search/searchIndex'
import type { AssemblyPlan, AssemblyLine } from './assemblyPlan'
import { spreadCandidates, type UsedRange } from './footageSpread'

export const CUT_MIN_MS = 3000
export const CUT_MAX_MS = 6000
export const CANDIDATES_PER_LINE = 8
export const MAX_ALTERNATIVES = 2
// The total is on target when it is within this share of the target length.
export const TARGET_TOLERANCE = 0.15
// Room for one reply covering up to 80 script lines.
export const FOOTAGE_MATCH_MAX_TOKENS = 6000

const MIN_TERM_LENGTH = 3
const MAX_TERMS_PER_LINE = 8
const CANDIDATE_TEXT_CHARS = 200
const PROMPT_OVERHEAD_TOKENS = 400
const TOKENS_PER_LINE = 80

// Words this common match nearly every clip, so they are not searched for.
const STOP_WORDS = new Set([
  'and',
  'are',
  'but',
  'can',
  'did',
  'does',
  'for',
  'from',
  'has',
  'have',
  'her',
  'his',
  'into',
  'its',
  'not',
  'our',
  'out',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your'
])

export interface FootageMatchLine {
  lineId: string
  text: string
}

export interface FootageSources {
  index: SearchIndex
  /** Display names of the media items, by media id. */
  mediaNames: Readonly<Record<string, string>>
  /** Shot ranges of each media item, by media id. Missing items are not snapped to shots. */
  shots: Readonly<Record<string, readonly ShotRange[]>>
  /** Duration of each media item in milliseconds, by media id. */
  durationsMs: Readonly<Record<string, number>>
}

export interface FootageMatchInput extends FootageSources {
  lines: readonly FootageMatchLine[]
  /** Footage an earlier script in the batch already uses. Empty when reuse is allowed. */
  usedRanges?: readonly UsedRange[]
  /** The script's target length, or null when the user left it open. */
  targetMs: number | null
}

export interface MatchCandidate {
  /** Unique across one request, so the reply can name it. */
  id: string
  mediaId: string
  mediaName: string
  kind: SearchKind
  text: string
  startMs: number
  endMs: number
}

export interface MatchLine {
  lineId: string
  text: string
  candidates: MatchCandidate[]
}

export interface FootageMatchRequest {
  lines: MatchLine[]
  targetMs: number | null
}

export interface PreparedFootageMatch {
  request: FootageMatchRequest
  prompt: string
  /** Lines that have candidates, and so are sent to the model. */
  promptLineCount: number
}

export interface FootageMatchPick {
  lineId: string
  candidateId: string
  inMs: number
  outMs: number
  alternatives: string[]
}

export interface CutRange {
  inMs: number
  outMs: number
}

export interface FootageMatchResult {
  plan: AssemblyPlan
  unmatchedLineIds: string[]
  totalMs: number
  /** Whether the total is near the target. Null when the script has no target. */
  targetHit: boolean | null
}

/**
 * The search index hits for one line's words, best first. The line is searched as one query, so every
 * word must match. When that finds too little, each word is searched on its own and the best hits are
 * kept, so a long line still finds clips about its main subjects.
 */
export function candidatesForLine(
  index: SearchIndex,
  text: string,
  limit = CANDIDATES_PER_LINE,
  used: readonly UsedRange[] = []
): SearchHit[] {
  const terms = queryTermsOf(text)
    .filter((term) => term.length >= MIN_TERM_LENGTH && !STOP_WORDS.has(term))
    .slice(0, MAX_TERMS_PER_LINE)
  if (terms.length === 0) return []

  const best = new Map<string, SearchHit>()
  const keep = (hits: SearchHit[]) => {
    for (const hit of hits) {
      const prior = best.get(hit.id)
      if (!prior || hit.score > prior.score) best.set(hit.id, hit)
    }
  }
  keep(index.search(terms.join(' '), limit))
  if (best.size < limit) {
    for (const term of terms) keep(index.search(term, limit))
  }
  const ranked = [...best.values()].sort(
    (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
  return spreadCandidates(ranked, used).slice(0, limit)
}

/** Shot boundaries of one media item in milliseconds, sorted, with the start and the end included. */
export function shotBoundariesMs(shots: readonly ShotRange[]): number[] {
  if (shots.length === 0) return []
  const points = new Set<number>([0])
  for (const shot of shots) {
    points.add(Math.round(shot.startSec * 1000))
    points.add(Math.round(shot.endSec * 1000))
  }
  return [...points].sort((a, b) => a - b)
}

// The last boundary at or before the value, if any.
function boundaryAtOrBefore(points: readonly number[], value: number): number | undefined {
  let found: number | undefined
  for (const point of points) {
    if (point > value) break
    found = point
  }
  return found
}

// The first boundary at or after the value, if any.
function boundaryAtOrAfter(points: readonly number[], value: number): number | undefined {
  return points.find((point) => point >= value)
}

// The last boundary inside the range, if any.
function boundaryWithin(points: readonly number[], low: number, high: number): number | undefined {
  let found: number | undefined
  for (const point of points) {
    if (point > high) break
    if (point >= low) found = point
  }
  return found
}

/**
 * Snaps a cut to shot boundaries and keeps its length between 3 and 6 seconds. The in point moves back
 * to the shot it starts in, and the out point forward to the end of the shot it ends in. A cut that is
 * too long ends on the last boundary that still fits, or at six seconds when none does. A cut that is
 * too short grows to the next boundary within six seconds, or to three seconds. With no shot data the
 * times are kept as given and only the length is limited. Null when the media is shorter than three
 * seconds or the cut is empty.
 */
export function snapCut(
  inMs: number,
  outMs: number,
  boundaries: readonly number[],
  durationMs: number | undefined
): CutRange | null {
  const duration = durationMs ?? Number.POSITIVE_INFINITY
  if (duration < CUT_MIN_MS) return null

  let start = Math.round(inMs)
  let end = Math.round(outMs)
  if (boundaries.length > 0) {
    start = boundaryAtOrBefore(boundaries, start) ?? 0
    end =
      boundaryAtOrAfter(boundaries, end) ??
      (Number.isFinite(duration) ? duration : Math.round(outMs))
  }

  if (end - start > CUT_MAX_MS) {
    end = boundaryWithin(boundaries, start + CUT_MIN_MS, start + CUT_MAX_MS) ?? start + CUT_MAX_MS
  } else if (end - start < CUT_MIN_MS) {
    const grown = boundaryAtOrAfter(boundaries, start + CUT_MIN_MS)
    end = grown !== undefined && grown <= start + CUT_MAX_MS ? grown : start + CUT_MIN_MS
  }

  if (end > duration) end = duration
  if (end - start < CUT_MIN_MS) start = Math.max(0, end - CUT_MIN_MS)
  if (end <= start || end - start < CUT_MIN_MS || end - start > CUT_MAX_MS) return null
  return { inMs: start, outMs: end }
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clipText(text: string): string {
  const clean = collapse(text)
  return clean.length > CANDIDATE_TEXT_CHARS
    ? `${clean.slice(0, CANDIDATE_TEXT_CHARS - 1)}…`
    : clean
}

/**
 * The request the model answers: each line with its candidate clips, and the target length. Candidate
 * ids are unique across the whole request. The prompt carries only lines that have candidates.
 */
export function prepareFootageMatch(input: FootageMatchInput): PreparedFootageMatch {
  let counter = 0
  const lines: MatchLine[] = input.lines.map((line) => ({
    lineId: line.lineId,
    text: line.text,
    candidates: candidatesForLine(input.index, line.text, undefined, input.usedRanges).map(
      (hit) => {
        counter += 1
        return {
          id: `c${counter}`,
          mediaId: hit.mediaId,
          mediaName: input.mediaNames[hit.mediaId] ?? 'unknown clip',
          kind: hit.kind,
          text: clipText(hit.text),
          startMs: hit.startMs,
          endMs: hit.endMs
        }
      }
    )
  }))
  const request: FootageMatchRequest = { lines, targetMs: input.targetMs }
  const withCandidates = lines.filter((line) => line.candidates.length > 0)
  return {
    request,
    prompt: buildFootageMatchPrompt(withCandidates, input.targetMs),
    promptLineCount: withCandidates.length
  }
}

/** The instructions, the lines and their candidate clips, and the JSON shape the reply must follow. */
export function buildFootageMatchPrompt(
  lines: readonly MatchLine[],
  targetMs: number | null
): string {
  const target =
    targetMs === null
      ? 'The script has no target length. Keep each cut short.'
      : `The whole script should run about ${Math.round(targetMs / 1000)} seconds.`
  const body = lines.flatMap((line) => [
    `<line id="${line.lineId}" text="${collapse(line.text).replace(/"/g, "'")}">`,
    ...line.candidates.map(
      (candidate) =>
        `  candidate ${candidate.id}: "${candidate.mediaName}", ${candidate.startMs}-${candidate.endMs} ms, ${candidate.kind}: ${candidate.text}`
    ),
    '</line>'
  ])
  return [
    'You match footage to the lines of a script for a vertical short video.',
    "For each line, pick the one candidate clip that best shows what the line says. Then give the in and out points in milliseconds, inside that candidate's range. A cut is 3 to 6 seconds long.",
    'You may list up to two alternatives for the same line: other candidate ids, best first.',
    target,
    'Use only the candidate ids given for each line. Give each line at most one entry. Leave out a line that has no fitting candidate.',
    'Reply with JSON only. No prose and no code fence. Use this shape:',
    '{"lines":[{"lineId":"...","candidateId":"c1","inMs":0,"outMs":4000,"alternatives":["c2"]}]}',
    '',
    '<script_lines>',
    ...body,
    '</script_lines>'
  ].join('\n')
}

const pickSchema = z.object({
  lineId: z.string().min(1),
  candidateId: z.string().min(1),
  inMs: z.number(),
  outMs: z.number(),
  alternatives: z.array(z.string()).optional()
})
const replySchema = z.object({ lines: z.array(pickSchema) })

/**
 * Reads the picks from a model reply. The first object in the text is taken, as with scripts. A pick
 * is kept only when its line and its candidate exist in the request, and the first pick per line wins.
 * Null when the reply holds no readable JSON of the right shape.
 */
export function parseMatchReply(
  text: string,
  request: FootageMatchRequest
): FootageMatchPick[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) return null
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const parsed = replySchema.safeParse(json)
  if (!parsed.success) return null

  const candidateIdsByLine = new Map(
    request.lines.map((line) => [line.lineId, new Set(line.candidates.map((c) => c.id))])
  )
  const seen = new Set<string>()
  const picks: FootageMatchPick[] = []
  for (const pick of parsed.data.lines) {
    const ids = candidateIdsByLine.get(pick.lineId)
    if (!ids || seen.has(pick.lineId) || !ids.has(pick.candidateId)) continue
    seen.add(pick.lineId)
    const alternatives = (pick.alternatives ?? [])
      .filter(
        (id, index, all) => ids.has(id) && id !== pick.candidateId && all.indexOf(id) === index
      )
      .slice(0, MAX_ALTERNATIVES)
    picks.push({
      lineId: pick.lineId,
      candidateId: pick.candidateId,
      inMs: Math.round(pick.inMs),
      outMs: Math.round(pick.outMs),
      alternatives
    })
  }
  return picks
}

/** Estimated dollars for one match run: the lines and candidates in, one short entry per line out. */
export function estimateFootageMatchCostUsd(
  model: VisionModel,
  prompt: string,
  lineCount: number
): number {
  return costForUsage(model, {
    inputTokens: estimateTokens(prompt) + PROMPT_OVERHEAD_TOKENS,
    outputTokens: lineCount * TOKENS_PER_LINE
  })
}

/**
 * Turns the picks into an assembly plan. Each pick is snapped to its media's shot boundaries. A pick
 * whose in and out are not a range falls back to the candidate's own range. Lines without a usable pick
 * are listed as unmatched, and the plan leaves them out.
 */
export function buildFootagePlan(
  request: FootageMatchRequest,
  picks: readonly FootageMatchPick[],
  sources: FootageSources
): FootageMatchResult {
  const pickByLine = new Map(picks.map((pick) => [pick.lineId, pick]))
  const lines: AssemblyLine[] = []
  const unmatchedLineIds: string[] = []
  let totalMs = 0

  for (const line of request.lines) {
    const pick = pickByLine.get(line.lineId)
    const chosen = pick ? line.candidates.find((c) => c.id === pick.candidateId) : undefined
    const primary =
      pick && chosen ? cutForCandidate(chosen, pick.inMs, pick.outMs, sources) : undefined
    if (!pick || !chosen || !primary) {
      unmatchedLineIds.push(line.lineId)
      continue
    }

    const alternatives = pick.alternatives.flatMap((id) => {
      const candidate = line.candidates.find((c) => c.id === id)
      const range = candidate
        ? cutForCandidate(candidate, candidate.startMs, candidate.endMs, sources)
        : undefined
      return candidate && range
        ? [{ sourceId: candidate.mediaId, inMs: range.inMs, outMs: range.outMs }]
        : []
    })

    totalMs += primary.outMs - primary.inMs
    lines.push({
      lineId: line.lineId,
      cuts: [
        {
          sourceId: chosen.mediaId,
          inMs: primary.inMs,
          outMs: primary.outMs,
          role: 'a',
          alternatives
        }
      ]
    })
  }

  const target = request.targetMs
  const targetHit =
    target === null || target <= 0 ? null : Math.abs(totalMs - target) <= target * TARGET_TOLERANCE
  return { plan: { lines }, unmatchedLineIds, totalMs, targetHit }
}

function cutForCandidate(
  candidate: MatchCandidate,
  inMs: number,
  outMs: number,
  sources: FootageSources
): CutRange | null {
  const usable = outMs > inMs
  const from = usable ? inMs : candidate.startMs
  const to = usable ? outMs : candidate.endMs
  const shots = sources.shots[candidate.mediaId] ?? []
  return snapCut(from, to, shotBoundariesMs(shots), sources.durationsMs[candidate.mediaId])
}
