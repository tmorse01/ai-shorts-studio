import { describe, expect, it } from 'vitest'
import { parseLineRewriteReply } from '@shared/ai/lineRewrite'
import { parseScriptReply } from '@shared/ai/scriptGeneration'
import { parseMatchReply, type FootageMatchRequest } from '@shared/assembly/footageMatch'
import { FAKE_REWRITE, FAKE_SCRIPT_LINES, fakeReply } from '../src/main/e2e/fakes'

const SCRIPT_PROMPT =
  'You write scripts for vertical short videos. Write 2 scripts about the topic below.\n' +
  'Reply with JSON only.'

const REWRITE_PROMPT =
  'You edit one line of a script for a vertical short video.\n<line_to_rewrite>\nOld line.\n</line_to_rewrite>'

function matchPrompt(lines: { id: string; candidates: string[] }[]): string {
  const body = lines.flatMap((line) => [
    `<line id="${line.id}" text="x">`,
    ...line.candidates.map(
      (id, index) => `  candidate ${id}: "clip-${index}.mp4", 0-30000 ms, tag: Harbour`
    ),
    '</line>'
  ])
  return ['Some instructions.', '<script_lines>', ...body, '</script_lines>'].join('\n')
}

describe('fake AI replies (E2E mode)', () => {
  it('answers a script brief with as many scripts as the prompt asks for, in the shape the app reads', () => {
    const scripts = parseScriptReply(fakeReply(SCRIPT_PROMPT))
    expect(scripts).toHaveLength(2)
    expect(scripts?.[0].lines.map((line) => line.text)).toEqual(FAKE_SCRIPT_LINES)
  })

  it('answers a rewrite with the fixed line, which the app reads as the new text', () => {
    expect(parseLineRewriteReply(fakeReply(REWRITE_PROMPT))).toBe(FAKE_REWRITE)
  })

  it('picks the first candidate for each line of a script, with the second as the alternative', () => {
    const prompt = matchPrompt([
      { id: 'l1', candidates: ['c1', 'c2'] },
      { id: 'l2', candidates: ['c3', 'c4'] }
    ])
    const request = {
      lines: [
        { lineId: 'l1', text: 'a', candidates: [{ id: 'c1' }, { id: 'c2' }] },
        { lineId: 'l2', text: 'b', candidates: [{ id: 'c3' }, { id: 'c4' }] }
      ]
    } as unknown as FootageMatchRequest
    const picks = parseMatchReply(fakeReply(prompt), request)
    expect(picks).toEqual([
      { lineId: 'l1', candidateId: 'c1', inMs: 0, outMs: 4000, alternatives: ['c2'] },
      { lineId: 'l2', candidateId: 'c3', inMs: 0, outMs: 4000, alternatives: ['c4'] }
    ])
  })

  it('picks the last candidate when a re-assemble asks for one line', () => {
    const prompt = matchPrompt([{ id: 'l2', candidates: ['c3', 'c4'] }])
    expect(JSON.parse(fakeReply(prompt))).toEqual({
      lines: [{ lineId: 'l2', candidateId: 'c4', inMs: 0, outMs: 4000, alternatives: ['c3'] }]
    })
  })

  it('keeps the empty list for any other prompt, as before', () => {
    expect(fakeReply('Describe this shot.')).toBe('[]')
  })
})
