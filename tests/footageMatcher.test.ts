import { describe, expect, it } from 'vitest'
import { AiService } from '../src/main/ai/aiService'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import type { AnthropicClient, MessageRequest } from '../src/main/ai/anthropicClient'
import { estimateFootageMatch, matchFootage } from '../src/main/ai/footageMatcher'
import type { SecretStore } from '../src/main/ai/secretStore'
import { UserFacingError } from '../src/main/errors'
import type { FootageMatchInput } from '@shared/assembly/footageMatch'
import { SearchIndex, type SearchDoc } from '@shared/search/searchIndex'

const KEY = 'sk-ant-test-0000000000000000000000'

function memorySecrets(initial: string | null = KEY): SecretStore {
  let value: string | null = initial
  return {
    isAvailable: () => true,
    read: async () => value,
    write: async (secret) => {
      value = secret
    },
    clear: async () => {
      value = null
    }
  }
}

const docs: SearchDoc[] = [
  {
    id: 'm1:shot:0',
    mediaId: 'm1',
    kind: 'shot',
    text: 'Fishing boats leave the harbour at dawn',
    startMs: 0,
    endMs: 6000
  },
  {
    id: 'm1:shot:1',
    mediaId: 'm1',
    kind: 'shot',
    text: 'Gulls circle over the pier',
    startMs: 6000,
    endMs: 12000
  }
]

function input(): FootageMatchInput {
  const index = new SearchIndex()
  index.replaceGroup('m1', docs)
  return {
    index,
    mediaNames: { m1: 'dock.mp4' },
    shots: {
      m1: [
        { startSec: 0, endSec: 6 },
        { startSec: 6, endSec: 12 }
      ]
    },
    durationsMs: { m1: 12000 },
    lines: [
      { lineId: 'L1', text: 'Boats leave the harbour' },
      { lineId: 'L2', text: 'the and of' }
    ],
    targetMs: 6000
  }
}

// Finds the candidate id the request offered for one line, so the fake reply can pick it.
function candidateFor(prompt: string, lineId: string): string {
  const match = new RegExp(`<line id="${lineId}"[\\s\\S]*?candidate (c\\d+):`).exec(prompt)
  if (!match) throw new Error(`no candidate offered for ${lineId}`)
  return match[1]
}

function setup(options: { key?: string | null; reply?: (prompt: string) => string } = {}) {
  const sent: MessageRequest[] = []
  const client: AnthropicClient = {
    sendMessage: async (request) => {
      sent.push(request)
      const text = options.reply
        ? options.reply(request.prompt)
        : JSON.stringify({
            lines: [
              {
                lineId: 'L1',
                candidateId: candidateFor(request.prompt, 'L1'),
                inMs: 0,
                outMs: 4000,
                alternatives: []
              }
            ]
          })
      return { text, usage: { inputTokens: 1500, outputTokens: 200 } }
    }
  }
  const ai = new AiService({
    secrets: memorySecrets(options.key === undefined ? KEY : options.key),
    state: memoryAiStateStorage(),
    createClient: () => client
  })
  return { ai, sent }
}

describe('matchFootage', () => {
  it('sends the candidates once, reads the picks and returns a snapped plan', async () => {
    const { ai, sent } = setup()
    const result = await matchFootage(ai, input())

    expect(sent).toHaveLength(1)
    expect(sent[0].prompt).toContain('<line id="L1"')
    expect(sent[0].prompt).not.toContain('<line id="L2"')
    expect(result.plan.lines).toEqual([
      {
        lineId: 'L1',
        cuts: [{ sourceId: 'm1', inMs: 0, outMs: 6000, role: 'a', alternatives: [] }]
      }
    ])
    expect(result.unmatchedLineIds).toEqual(['L2'])
    expect(result.targetHit).toBe(true)

    const status = await ai.status()
    expect(status.usage.costUsd).toBeGreaterThan(0)
  })

  it('makes no API call when no line has candidates', async () => {
    const { ai, sent } = setup()
    const result = await matchFootage(ai, {
      ...input(),
      lines: [{ lineId: 'L2', text: 'the and of' }]
    })
    expect(sent).toHaveLength(0)
    expect(result.plan.lines).toEqual([])
    expect(result.unmatchedLineIds).toEqual(['L2'])
  })

  it('throws a plain message when the reply is unreadable', async () => {
    const { ai } = setup({ reply: () => 'I could not decide.' })
    await expect(matchFootage(ai, input())).rejects.toBeInstanceOf(UserFacingError)
  })

  it('refuses to run without a saved key', async () => {
    const { ai, sent } = setup({ key: null })
    await expect(matchFootage(ai, input())).rejects.toThrow('Add an Anthropic API key')
    expect(sent).toHaveLength(0)
  })
})

describe('estimateFootageMatch', () => {
  it('estimates the cost against the cap without calling the API', async () => {
    const { ai, sent } = setup()
    const estimate = await estimateFootageMatch(ai, input())
    expect(estimate.estimateUsd).toBeGreaterThan(0)
    expect(estimate.lineCount).toBe(1)
    expect(estimate.capStatus).toBe('uncapped')
    expect(sent).toHaveLength(0)
  })
})
