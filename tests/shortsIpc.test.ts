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
import { proposeShorts, type ShortsFootageSource } from '../src/main/ai/shortGenerator'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'
import type { GenerateShortsInput } from '@shared/shorts/shortPlan'

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

// The reply proposes one short with one moment. Its edges sit near shot boundaries, so they snap onto them.
const reply = JSON.stringify({
  shorts: [
    {
      title: 'Dawn run',
      hook: 'Boats leave the harbour',
      moments: [{ mediaId: 'm1', name: 'Launch', startSec: 0.2, endSec: 9.8 }]
    }
  ]
})

const fixedFootage: ShortsFootageSource = async () => ({
  shots: [
    { shotIndex: 0, startSec: 0, endSec: 10 },
    { shotIndex: 1, startSec: 10, endSec: 30 }
  ],
  segments: [],
  suggestions: []
})

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'shorts-ipc-'))
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
  // The shorts job runs the same proposal path the app uses, with the footage fixed.
  const never = () => new Promise<never>(() => undefined)
  const executors = {
    probe: never,
    thumbs: never,
    filmstrip: never,
    proxy: never,
    analysis: never,
    shorts: ({ shorts }: { shorts?: GenerateShortsInput }) => {
      if (!shorts) throw new Error('The shorts job lost its request.')
      return proposeShorts(ai, fixedFootage, shorts)
    }
  } as unknown as JobExecutors
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(executors),
    ai
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { api, sent }
}

const KEY = 'sk-ant-test-0000000000000000000000'

const input = {
  projectFolder: 'C:/projects/harbour',
  sources: [{ mediaId: 'm1', fileName: 'dock.mp4', durationMs: 30000 }],
  existingMoments: [],
  request: {
    count: 3,
    momentsPerShort: { min: 4, max: 6 },
    targetLength: { minSec: 30, maxSec: 60 },
    angle: '',
    avoidReuse: true
  }
}

describe('ai:shorts:propose IPC round trip', () => {
  it('refuses to run without a saved key and sends nothing', async () => {
    const { api, sent } = setup()
    const result = await api.invoke('ai:shorts:propose', input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('Add an Anthropic API key')
    expect(sent).toHaveLength(0)
  })

  it('returns validated proposals with moments snapped to the shots, and records usage', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:shorts:propose', input)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.shorts).toEqual([
      {
        title: 'Dawn run',
        hook: 'Boats leave the harbour',
        moments: [{ mediaId: 'm1', name: 'Launch', inMs: 0, outMs: 10000 }]
      }
    ])
    expect(sent).toHaveLength(1)
  })

  it('rejects a malformed request before any work', async () => {
    const { api, sent } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:shorts:propose', {
      ...input,
      request: { ...input.request, count: 9 }
    })

    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
  })
})
