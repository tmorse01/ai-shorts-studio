import { describe, expect, it } from 'vitest'
import { AiService } from '../src/main/ai/aiService'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import type { AnthropicClient, MessageRequest } from '../src/main/ai/anthropicClient'
import { estimateScriptRun, generateScripts } from '../src/main/ai/scriptGenerator'
import type { ScriptFootageSource } from '../src/main/ai/scriptFootage'
import type { SecretStore } from '../src/main/ai/secretStore'
import { UserFacingError } from '../src/main/errors'
import type { ScriptRunInput } from '@shared/ai/scriptGeneration'

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

const footage: ScriptFootageSource = async () => ({
  transcript: [{ mediaName: 'dock.mp4', startSec: 4, text: 'The boats leave at five.' }],
  shots: [
    {
      mediaName: 'dock.mp4',
      shotIndex: 0,
      startSec: 0,
      endSec: 6,
      description: 'Fishing boats in the harbour',
      tags: ['boats']
    }
  ]
})

const reply = JSON.stringify({
  scripts: [
    { title: 'One', topic: 'Boats', lines: [{ text: 'First.' }] },
    { title: 'Two', topic: 'Boats', lines: [{ text: 'Second.' }] },
    { title: 'Three', topic: 'Boats', lines: [{ text: 'Third.' }] }
  ]
})

function setup(options: { key?: string | null; text?: string } = {}) {
  const sent: MessageRequest[] = []
  const client: AnthropicClient = {
    sendMessage: async (request) => {
      sent.push(request)
      return { text: options.text ?? reply, usage: { inputTokens: 1200, outputTokens: 300 } }
    }
  }
  const ai = new AiService({
    secrets: memorySecrets(options.key === undefined ? KEY : options.key),
    state: memoryAiStateStorage(),
    createClient: () => client
  })
  return { ai, sent }
}

const input: ScriptRunInput = {
  projectFolder: 'G:/unused',
  media: [{ id: 'm1', fileName: 'dock.mp4' }],
  request: { topic: 'Harbour', count: 2, targetSeconds: 30, tone: '', notes: '' }
}

describe('generateScripts', () => {
  it('sends the brief and the footage once, and returns the requested number of drafts', async () => {
    const { ai, sent } = setup()
    const drafts = await generateScripts(ai, footage, input)

    expect(sent).toHaveLength(1)
    expect(sent[0].prompt).toContain('Topic: Harbour')
    expect(sent[0].prompt).toContain('[dock.mp4, 0:04] The boats leave at five.')
    expect(sent[0].prompt).toContain('[dock.mp4, shot 1, 0:00-0:06] Fishing boats in the harbour')
    expect(drafts.map((draft) => draft.title)).toEqual(['One', 'Two'])
  })

  it('records the usage the reply reported', async () => {
    const { ai } = setup()
    await generateScripts(ai, footage, input)
    const status = await ai.status()

    expect(status.usage.inputTokens).toBe(1200)
    expect(status.usage.outputTokens).toBe(300)
    expect(status.usage.costUsd).toBeGreaterThan(0)
  })

  it('refuses with a plain message when no key is saved, and sends nothing', async () => {
    const { ai, sent } = setup({ key: null })

    await expect(generateScripts(ai, footage, input)).rejects.toThrow(
      'Add an Anthropic API key in Settings first.'
    )
    expect(sent).toHaveLength(0)
  })

  it('refuses when the monthly cap is reached', async () => {
    const { ai, sent } = setup()
    await ai.updateSettings({ monthlySpendCapUsd: 0.01 })
    await ai.recordUsage('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 0 })

    await expect(generateScripts(ai, footage, input)).rejects.toBeInstanceOf(UserFacingError)
    expect(sent).toHaveLength(0)
  })

  it('reports an unreadable reply as a plain error', async () => {
    const { ai } = setup({ text: 'Sorry, no scripts today.' })

    await expect(generateScripts(ai, footage, input)).rejects.toThrow(
      'Claude sent a reply the app could not read.'
    )
  })
})

describe('estimateScriptRun', () => {
  it('reports the model, the footage used and the cost, without calling the API', async () => {
    const { ai, sent } = setup()
    const estimate = await estimateScriptRun(ai, footage, input)

    expect(sent).toHaveLength(0)
    expect(estimate).toMatchObject({
      model: 'claude-haiku-5-5',
      transcriptUsed: 1,
      shotsUsed: 1,
      capStatus: 'uncapped',
      remainingUsd: null
    })
    expect(estimate.estimateUsd).toBeGreaterThan(0)
  })
})
