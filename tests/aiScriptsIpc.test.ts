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
import type { ScriptFootageSource } from '../src/main/ai/scriptFootage'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'

// No request leaves the test: the client is a fake, the key lives in memory, and the footage is fixed.
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

const footage: ScriptFootageSource = async () => ({
  transcript: [{ mediaName: 'dock.mp4', startSec: 1, text: 'Boats at dawn.' }],
  shots: []
})

const reply = JSON.stringify({
  scripts: [{ title: 'Dawn', topic: 'Boats', lines: [{ text: 'Boats at dawn.' }] }]
})

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'ai-scripts-ipc-'))
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
    ai,
    scriptFootage: footage
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { api, sent }
}

const KEY = 'sk-ant-test-0000000000000000000000'
const runInput = {
  projectFolder: 'G:/unused',
  media: [{ id: 'm1', fileName: 'dock.mp4' }],
  request: { topic: 'Boats', count: 1, targetSeconds: null, tone: '', notes: '' }
}

describe('AI script IPC round trip', () => {
  it('ai:scripts:estimate reports the cost and sends nothing', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:scripts:estimate', runInput)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      model: 'claude-haiku-5-5',
      transcriptUsed: 1,
      shotsUsed: 0
    })
    expect(sent).toHaveLength(0)
  })

  it('ai:scripts:generate returns validated drafts and records usage', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:scripts:generate', runInput)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.scripts).toEqual([
      { title: 'Dawn', topic: 'Boats', lines: [{ text: 'Boats at dawn.' }] }
    ])
    expect(sent).toHaveLength(1)
    const status = await api.invoke('ai:status', {})
    expect(status.ok && status.data.usage.outputTokens).toBe(80)
  })

  it('ai:scripts:generate rejects a count above the limit before any work', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:scripts:generate', {
      ...runInput,
      request: { ...runInput.request, count: 9 }
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    expect(sent).toHaveLength(0)
  })
})
