import { describe, expect, it } from 'vitest'
import {
  buildScriptPrompt,
  estimateScriptCostUsd,
  parseScriptReply,
  scriptRequestSchema,
  type ScriptRequest
} from '@shared/ai/scriptGeneration'

const request: ScriptRequest = {
  topic: 'Harbour at dawn',
  count: 2,
  targetSeconds: 45,
  tone: 'calm',
  notes: 'Keep it short.'
}

const scriptJson = (title: string) =>
  JSON.stringify({
    scripts: [
      {
        title,
        topic: 'Boats',
        lines: [
          { text: 'The boats leave at five.', beat: 'hook', footageHints: ['dock.mp4, 0:04'] }
        ]
      }
    ]
  })

describe('buildScriptPrompt', () => {
  it('asks for the requested count, the length, and JSON only, with the grounding inside', () => {
    const prompt = buildScriptPrompt(request, 'Topic: Harbour at dawn')

    expect(prompt).toContain('Write 2 scripts')
    expect(prompt).toContain('about 45 seconds')
    expect(prompt).toContain('JSON only')
    expect(prompt).toContain('<footage_and_brief>\nTopic: Harbour at dawn\n</footage_and_brief>')
  })

  it('says so when there is no footage, and drops the length when none was given', () => {
    const prompt = buildScriptPrompt({ ...request, count: 1, targetSeconds: null }, '  ')

    expect(prompt).toContain('Write 1 script ')
    expect(prompt).toContain('No footage notes were available')
    expect(prompt).not.toContain('seconds.')
  })
})

describe('parseScriptReply', () => {
  it('reads bare JSON', () => {
    const scripts = parseScriptReply(scriptJson('Dawn'))

    expect(scripts).toEqual([
      {
        title: 'Dawn',
        topic: 'Boats',
        lines: [
          { text: 'The boats leave at five.', beat: 'hook', footageHints: ['dock.mp4, 0:04'] }
        ]
      }
    ])
  })

  it('still finds the JSON when a code fence or a sentence surrounds it', () => {
    const wrapped = `Here you go:\n\`\`\`json\n${scriptJson('Dawn')}\n\`\`\``

    expect(parseScriptReply(wrapped)?.[0].title).toBe('Dawn')
  })

  it('returns null for text that is not a valid script reply', () => {
    expect(parseScriptReply('I cannot help with that.')).toBeNull()
    expect(parseScriptReply('{"scripts": []}')).toBeNull()
    expect(parseScriptReply('{"scripts": [{"title": "", "topic": "", "lines": []}]}')).toBeNull()
    expect(parseScriptReply('{"scripts":[')).toBeNull()
  })
})

describe('estimateScriptCostUsd', () => {
  it('costs more for more scripts and for more footage', () => {
    const small = estimateScriptCostUsd('claude-haiku-5-5', 'short', 1)
    const more = estimateScriptCostUsd('claude-haiku-5-5', 'short', 3)
    const footage = estimateScriptCostUsd('claude-haiku-5-5', 'x'.repeat(8000), 1)

    expect(more).toBeGreaterThan(small)
    expect(footage).toBeGreaterThan(small)
    expect(small).toBeGreaterThan(0)
  })

  it('uses the price of the chosen model', () => {
    const haiku = estimateScriptCostUsd('claude-haiku-5-5', 'text', 2)
    const sonnet = estimateScriptCostUsd('claude-sonnet-5-5', 'text', 2)

    expect(sonnet).toBeGreaterThan(haiku)
  })
})

describe('scriptRequestSchema', () => {
  it('keeps the count within 1 to 5 and the length within 5 to 900 seconds', () => {
    expect(scriptRequestSchema.safeParse({ ...request, count: 6 }).success).toBe(false)
    expect(scriptRequestSchema.safeParse({ ...request, count: 0 }).success).toBe(false)
    expect(scriptRequestSchema.safeParse({ ...request, targetSeconds: 4 }).success).toBe(false)
    expect(scriptRequestSchema.safeParse({ ...request, targetSeconds: null }).success).toBe(true)
  })
})
