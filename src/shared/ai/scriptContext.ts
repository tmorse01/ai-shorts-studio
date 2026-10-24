// Builds the grounding text for a script request: the user's topic and notes, plus transcript excerpts
// and shot descriptions from the footage, trimmed to a token budget. Pure, so the selection and the
// budget can be tested without the model, the disk or the analysis queue.

// A rough token count. English text runs about four characters to a token, so this is a planning
// number. Budgets are kept in characters internally so the final text never exceeds the budget.
const CHARS_PER_TOKEN = 4

// Room for the footage excerpts in one request. The user's own topic and notes are always kept.
export const SCRIPT_CONTEXT_TOKEN_BUDGET = 6000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export interface TranscriptExcerpt {
  mediaName: string
  startSec: number
  text: string
}

export interface ShotNote {
  mediaName: string
  // Zero-based shot number within its media item.
  shotIndex: number
  startSec: number
  endSec: number
  description: string
  tags: readonly string[]
}

export interface ScriptContextInput {
  topic: string
  targetSeconds?: number | null
  tone?: string
  notes?: string
  transcript: readonly TranscriptExcerpt[]
  shots: readonly ShotNote[]
}

export interface ScriptContext {
  text: string
  // Estimated tokens of `text`. Never more than the budget.
  tokens: number
  transcriptUsed: number
  transcriptDropped: number
  shotsUsed: number
  shotsDropped: number
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** m:ss for a time in seconds. Whole seconds, rounded down. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}

function compareMediaThenTime(
  a: { mediaName: string; startSec: number },
  b: { mediaName: string; startSec: number }
): number {
  if (a.mediaName !== b.mediaName) return a.mediaName < b.mediaName ? -1 : 1
  return a.startSec - b.startSec
}

// The header is what the user typed. It is always kept, and the footage budget is what is left.
function buildHeader(input: ScriptContextInput): string[] {
  const lines: string[] = []
  const topic = collapse(input.topic)
  if (topic) lines.push(`Topic: ${topic}`)
  if (input.targetSeconds && input.targetSeconds > 0) {
    lines.push(`Target length: about ${Math.round(input.targetSeconds)} sec`)
  }
  const tone = collapse(input.tone ?? '')
  if (tone) lines.push(`Tone: ${tone}`)
  const notes = (input.notes ?? '').trim()
  if (notes) lines.push(`Notes: ${notes}`)
  return lines
}

function transcriptLine(excerpt: TranscriptExcerpt): string {
  return `- [${excerpt.mediaName}, ${formatClock(excerpt.startSec)}] ${collapse(excerpt.text)}`
}

function shotLine(shot: ShotNote): string {
  const tags = shot.tags.map(collapse).filter(Boolean)
  const tagText = tags.length > 0 ? ` (${tags.join(', ')})` : ''
  const range = `${formatClock(shot.startSec)}-${formatClock(shot.endSec)}`
  return `- [${shot.mediaName}, shot ${shot.shotIndex + 1}, ${range}] ${collapse(shot.description)}${tagText}`
}

/**
 * Assembles the context for a script request. Transcript excerpts and shot descriptions are taken in
 * turns, so neither kind crowds out the other, until the footage budget is used up. An item that does
 * not fit is skipped and a shorter one after it may still go in. The chosen footage is then written in
 * media and time order, so the model reads it the way it appears on screen.
 */
export function buildScriptContext(
  input: ScriptContextInput,
  budgetTokens: number = SCRIPT_CONTEXT_TOKEN_BUDGET
): ScriptContext {
  const header = buildHeader(input)
  const headerText = header.join('\n')
  const budgetChars = Math.max(0, Math.floor(budgetTokens)) * CHARS_PER_TOKEN
  // Reserve the section headings and the blank lines between sections, so the final text stays
  // within the budget whichever sections end up non-empty.
  const headingChars = 'Transcript excerpts:\n'.length + 'Shot descriptions:\n'.length
  const separatorChars = 2 * 2
  const headerChars = header.length > 0 ? headerText.length + 2 : 0
  let remaining = budgetChars - headerChars - headingChars - separatorChars

  const transcript = input.transcript
    .filter((excerpt) => collapse(excerpt.text) !== '')
    .map((excerpt, index) => ({ index, excerpt, line: transcriptLine(excerpt) }))
  const shots = input.shots
    .filter((shot) => collapse(shot.description) !== '')
    .map((shot, index) => ({ index, shot, line: shotLine(shot) }))

  // Alternate between the two lists in input order, so both get a turn at the budget.
  const order: Array<{ kind: 'transcript' | 'shot'; position: number }> = []
  const longest = Math.max(transcript.length, shots.length)
  for (let step = 0; step < longest; step += 1) {
    if (step < transcript.length) order.push({ kind: 'transcript', position: step })
    if (step < shots.length) order.push({ kind: 'shot', position: step })
  }

  const chosenTranscript: { mediaName: string; startSec: number; line: string }[] = []
  const chosenShots: { mediaName: string; startSec: number; line: string }[] = []
  let transcriptDropped = 0
  let shotsDropped = 0

  for (const step of order) {
    // Each line is followed by a newline, so count that too.
    if (step.kind === 'transcript') {
      const item = transcript[step.position]
      const cost = item.line.length + 1
      if (cost <= remaining) {
        remaining -= cost
        chosenTranscript.push({
          mediaName: item.excerpt.mediaName,
          startSec: item.excerpt.startSec,
          line: item.line
        })
      } else {
        transcriptDropped += 1
      }
    } else {
      const item = shots[step.position]
      const cost = item.line.length + 1
      if (cost <= remaining) {
        remaining -= cost
        chosenShots.push({
          mediaName: item.shot.mediaName,
          startSec: item.shot.startSec,
          line: item.line
        })
      } else {
        shotsDropped += 1
      }
    }
  }

  const sections: string[] = []
  if (header.length > 0) sections.push(headerText)
  if (chosenTranscript.length > 0) {
    chosenTranscript.sort(compareMediaThenTime)
    sections.push(['Transcript excerpts:', ...chosenTranscript.map((item) => item.line)].join('\n'))
  }
  if (chosenShots.length > 0) {
    chosenShots.sort(compareMediaThenTime)
    sections.push(['Shot descriptions:', ...chosenShots.map((item) => item.line)].join('\n'))
  }

  const text = sections.join('\n\n')
  return {
    text,
    tokens: estimateTokens(text),
    transcriptUsed: chosenTranscript.length,
    transcriptDropped,
    shotsUsed: chosenShots.length,
    shotsDropped
  }
}
