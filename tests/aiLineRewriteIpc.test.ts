import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { AiService } from '../src/main/ai/aiService'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import type { SecretStore } from '../src/main/ai/secretStore'
import type { MessageRequest } from '../src/main/ai/anthropicClient'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'

// No request leaves the test: the client is a fake and the key lives in memory.
function memorySecrets(): SecretStore {
  let value: string | null = null
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

function pendingForever(): JobExecutors {
  const never = () => new Promise<never>(() => undefined)
  return {
    probe: never,
    thumbs: never,
    filmstrip: never,
    proxy: never,
    analysis: never
  } as unknown as JobExecutors
}

function setup(reply = '"The boats leave at dawn."') {
  const folder = mkdtempSync(join(tmpdir(), 'ai-line-rewrite-ipc-'))
  const sent: MessageRequest[] = []
  const ai = new AiService({
    secrets: memorySecrets(),
    state: memoryAiStateStorage(),
    createClient: () => ({
      sendMessage: async (request) => {
        sent.push(request)
        return { text: reply, usage: { inputTokens: 300, outputTokens: 20 } }
      }
    })
  })
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(pendingForever()),
    ai
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { api, sent }
}

const KEY = 'sk-ant-test-0000000000000000000000'
const request = {
  action: 'shorter' as const,
  text: 'The boats leave before the sun is fully up over the water.',
  scriptTitle: 'Harbour hook',
  before: [],
  after: ['Then the nets come in.']
}

describe('AI line rewrite IPC round trip', () => {
  it('ai:scripts:rewriteLine returns the rewritten text and records usage', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:scripts:rewriteLine', request)

    expect(result).toEqual({ ok: true, data: { text: 'The boats leave at dawn.' } })
    expect(sent).toHaveLength(1)
    expect(sent[0].prompt).toContain('Make the line shorter.')
    const status = await api.invoke('ai:status', {})
    expect(status.ok && status.data.usage.outputTokens).toBe(20)
  })

  it('ai:scripts:rewriteLine refuses an unknown action before any work', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:scripts:rewriteLine', {
      ...request,
      action: 'louder' as never
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    expect(sent).toHaveLength(0)
  })

  it('ai:scripts:rewriteLine explains a missing key in plain language and sends nothing', async () => {
    const { api, sent } = setup()
    const result = await api.invoke('ai:scripts:rewriteLine', request)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('Add an Anthropic API key in Settings first.')
    expect(sent).toHaveLength(0)
  })

  it('ai:scripts:rewriteLine reports an unreadable reply as a plain error', async () => {
    const { api } = setup('')
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:scripts:rewriteLine', request)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('Claude sent a reply the app could not read. Try again.')
  })
})
