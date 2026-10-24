import { describe, expect, it } from 'vitest'
import {
  buildLineRewritePrompt,
  lineRewriteInputSchema,
  parseLineRewriteReply,
  LINE_MAX_CHARS
} from '@shared/ai/lineRewrite'

const input = {
  action: 'shorter' as const,
  text: 'The harbour opens before dawn and the boats leave in a long line.',
  scriptTitle: 'Harbour hook',
  before: ['Every morning starts here.'],
  after: ['Then the nets come in.']
}

describe('line rewrite prompt', () => {
  it('asks for the chosen action and marks the neighbouring lines as context', () => {
    const prompt = buildLineRewritePrompt(input)
    expect(prompt).toContain('Make the line shorter.')
    expect(prompt).toContain('<line_to_rewrite>\n' + input.text + '\n</line_to_rewrite>')
    expect(prompt).toContain('Every morning starts here.')
    expect(prompt).toContain('Then the nets come in.')
    expect(prompt).toContain('Reply with the rewritten line only.')
  })

  it('says when there are no neighbouring lines or no title', () => {
    const prompt = buildLineRewritePrompt({ ...input, before: [], after: [], scriptTitle: '' })
    expect(prompt).toContain('(none)')
    expect(prompt).toContain('(untitled)')
  })

  it('tells the model not to invent facts when it makes a line longer', () => {
    expect(buildLineRewritePrompt({ ...input, action: 'longer' })).toContain('Do not invent facts.')
  })
})

describe('line rewrite reply', () => {
  it('reads a bare line and removes wrapping quotes', () => {
    expect(parseLineRewriteReply('The boats leave at dawn.')).toBe('The boats leave at dawn.')
    expect(parseLineRewriteReply('"The boats leave at dawn."')).toBe('The boats leave at dawn.')
  })

  it('turns line breaks into spaces and trims', () => {
    expect(parseLineRewriteReply('  The boats\n  leave at dawn.  \n')).toBe(
      'The boats leave at dawn.'
    )
  })

  it('returns null for an empty reply or one longer than a line may be', () => {
    expect(parseLineRewriteReply('   ')).toBeNull()
    expect(parseLineRewriteReply('x'.repeat(LINE_MAX_CHARS + 1))).toBeNull()
  })
})

describe('line rewrite input schema', () => {
  it('accepts a request and rejects an unknown action or an empty line', () => {
    expect(lineRewriteInputSchema.safeParse(input).success).toBe(true)
    expect(lineRewriteInputSchema.safeParse({ ...input, action: 'louder' }).success).toBe(false)
    expect(lineRewriteInputSchema.safeParse({ ...input, text: '   ' }).success).toBe(false)
  })

  it('caps the context at three lines on each side', () => {
    const four = ['a', 'b', 'c', 'd']
    expect(lineRewriteInputSchema.safeParse({ ...input, before: four }).success).toBe(false)
  })
})
