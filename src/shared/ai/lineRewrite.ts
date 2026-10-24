// Line rewriting rules: the four actions, what the request carries, the prompt, and how the reply is
// read. Pure, so the prompt and the reader are tested without the API. The line is rewritten on its own;
// the lines around it are sent only as context, so the rewrite keeps the script's flow.
import { z } from 'zod'

export const LINE_REWRITE_ACTIONS = ['rewrite', 'shorter', 'longer', 'punchier'] as const
export const lineRewriteActionSchema = z.enum(LINE_REWRITE_ACTIONS)
export type LineRewriteAction = z.infer<typeof lineRewriteActionSchema>

export const LINE_REWRITE_ACTION_LABELS: Record<LineRewriteAction, string> = {
  rewrite: 'Rewrite',
  shorter: 'Shorter',
  longer: 'Longer',
  punchier: 'Punchier'
}

export const LINE_MAX_CHARS = 400
// One spoken sentence fits well inside this.
export const LINE_REWRITE_MAX_TOKENS = 300

// Up to this many neighbouring lines on each side are sent as context.
export const LINE_CONTEXT_LINES = 3

export const lineRewriteInputSchema = z.object({
  action: lineRewriteActionSchema,
  text: z.string().trim().min(1).max(LINE_MAX_CHARS),
  scriptTitle: z.string().trim().max(120),
  before: z.array(z.string().max(LINE_MAX_CHARS)).max(LINE_CONTEXT_LINES),
  after: z.array(z.string().max(LINE_MAX_CHARS)).max(LINE_CONTEXT_LINES)
})
export type LineRewriteInput = z.infer<typeof lineRewriteInputSchema>

export const lineRewriteOutputSchema = z.object({
  text: z.string().min(1).max(LINE_MAX_CHARS)
})
export type LineRewriteOutput = z.infer<typeof lineRewriteOutputSchema>

const ACTION_INSTRUCTIONS: Record<LineRewriteAction, string> = {
  rewrite: 'Rewrite the line so it reads more clearly. Keep its meaning and its facts.',
  shorter: 'Make the line shorter. Keep its meaning and every fact it states.',
  longer:
    'Make the line longer by adding detail. Use only facts that the surrounding lines support. Do not invent facts.',
  punchier:
    'Make the line punchier: stronger verbs, fewer filler words and a sharper rhythm. Keep its meaning and its facts.'
}

/** The instructions and the line, with the surrounding lines marked as context only. */
export function buildLineRewritePrompt(input: LineRewriteInput): string {
  const before = input.before.length > 0 ? input.before.join('\n') : '(none)'
  const after = input.after.length > 0 ? input.after.join('\n') : '(none)'
  return [
    'You edit one line of a script for a vertical short video.',
    ACTION_INSTRUCTIONS[input.action],
    'Keep the same language. Write one spoken sentence, or the closest equivalent.',
    'Reply with the rewritten line only. No quotes, no label and no explanation.',
    '',
    `Script: ${input.scriptTitle === '' ? '(untitled)' : input.scriptTitle}`,
    '',
    '<lines_before>',
    before,
    '</lines_before>',
    '',
    '<line_to_rewrite>',
    input.text,
    '</line_to_rewrite>',
    '',
    '<lines_after>',
    after,
    '</lines_after>'
  ].join('\n')
}

/**
 * Reads the rewritten line from a reply. Wrapping quotes are removed and line breaks become spaces.
 * Null when nothing usable is left, or when the line is longer than a line may be.
 */
export function parseLineRewriteReply(text: string): string | null {
  let line = text.replace(/\s*\n\s*/g, ' ').trim()
  const wrapped = /^(["'“‘`])(.*)(["'”’`])$/s.exec(line)
  if (wrapped) line = wrapped[2].trim()
  if (line === '' || line.length > LINE_MAX_CHARS) return null
  return line
}
