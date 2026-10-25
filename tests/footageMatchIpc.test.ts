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

// No request leaves the test: the client is a fake, the key lives in memory, and the reply is fixed.
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

// The first candidate for the line is always c1, so the fixed reply names it.
const reply = JSON.stringify({
  lines: [{ lineId: 'L1', candidateId: 'c1', inMs: 0, outMs: 4000 }]
})

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'footage-match-ipc-'))
  const sent: MessageRequest[] = []
  const ai = new AiService({
    secrets: memorySecrets(),
    state: memoryAiStateStorage(),
    createClient: () => ({
      sendMessage: async (request) => {
        sent.push(request)
        return { text: reply, usage: { inputTokens: 500, outputTokens: 80 } }
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
  lines: [{ lineId: 'L1', text: 'Boats at dawn' }],
  targetMs: null,
  docs: [
    {
      id: 'm1-segment-0',
      mediaId: 'm1',
      kind: 'segment' as const,
      text: 'Boats at dawn on the harbour.',
      startMs: 0,
      endMs: 5000
    }
  ],
  mediaNames: { m1: 'dock.mp4' },
  shots: {},
  durationsMs: { m1: 60000 }
}

describe('footage match IPC round trip', () => {
  it('ai:footage:match refuses to run without a saved key', async () => {
    const { api, sent } = setup()
    const result = await api.invoke('ai:footage:match', request)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('Add an Anthropic API key')
    expect(sent).toHaveLength(0)
  })

  it('ai:footage:match returns a validated plan and records usage', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:footage:match', request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.unmatchedLineIds).toEqual([])
    expect(result.data.plan.lines).toEqual([
      {
        lineId: 'L1',
        cuts: [{ sourceId: 'm1', inMs: 0, outMs: 4000, role: 'a', alternatives: [] }]
      }
    ])
    expect(result.data.totalMs).toBe(4000)
    expect(sent).toHaveLength(1)
  })

  it('ai:footage:match lists lines with no candidates as unmatched and sends nothing', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:footage:match', {
      ...request,
      lines: [{ lineId: 'L9', text: 'Zebras crossing' }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.unmatchedLineIds).toEqual(['L9'])
    expect(result.data.plan.lines).toEqual([])
    expect(sent).toHaveLength(0)
  })

  it('ai:footage:match rejects a malformed request before any work', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:footage:match', { ...request, lines: [] })

    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
  })
})
