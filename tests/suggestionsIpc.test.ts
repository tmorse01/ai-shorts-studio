import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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
import type { SuggestionFootage } from '../src/main/analysis/suggestionsService'
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

const footage: SuggestionFootage = {
  speech: true,
  segments: [
    { startMs: 500, endMs: 9800, text: 'The boats leave at dawn.' },
    { startMs: 10200, endMs: 24600, text: 'Then the nets come in.' }
  ],
  shots: [
    { shotIndex: 0, startSec: 0, endSec: 10, description: 'Boats at a pier' },
    { shotIndex: 1, startSec: 10, endSec: 25, description: 'Nets on the deck' }
  ],
  shotTags: [['outdoor', 'harbour'], ['outdoor']]
}

const reply = JSON.stringify([
  { name: 'Dawn departure', startSec: 0.4, endSec: 24.1, note: 'Opens on the boats.' },
  { name: 'Too brief', startSec: 3, endSec: 3.5 }
])

function setup(options: { reply?: string; withKey?: boolean } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'suggestions-ipc-'))
  const sent: MessageRequest[] = []
  const ai = new AiService({
    secrets: memorySecrets(),
    state: memoryAiStateStorage(),
    createClient: () => ({
      sendMessage: async (request) => {
        sent.push(request)
        return { text: options.reply ?? reply, usage: { inputTokens: 900, outputTokens: 120 } }
      }
    })
  })
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(pendingForever()),
    ai,
    suggestionFootage: async () => footage
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { api, sent, folder, ai }
}

const KEY = 'sk-ant-test-0000000000000000000000'
const mediaId = 'media_1'

describe('AI suggestions IPC round trip', () => {
  it('analysis:suggestions:read derives tags and returns no moments before a search', async () => {
    const { api, folder } = setup()
    const result = await api.invoke('analysis:suggestions:read', {
      projectFolder: folder,
      mediaId
    })
    expect(result).toEqual({
      ok: true,
      data: { tags: ['A-roll', 'outdoor', 'harbour'], moments: [] }
    })
  })

  it('analysis:suggestions:findMoments asks Claude once and returns aligned moments', async () => {
    const { api, sent, folder, ai } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('analysis:suggestions:findMoments', {
      projectFolder: folder,
      mediaId,
      fileName: 'harbour.mp4',
      durationMs: 25000
    })
    expect(result).toEqual({
      ok: true,
      data: {
        tags: ['A-roll', 'outdoor', 'harbour'],
        moments: [{ name: 'Dawn departure', inMs: 500, outMs: 24600, note: 'Opens on the boats.' }]
      }
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].prompt).toContain('[0.5s] The boats leave at dawn.')
    expect(sent[0].prompt).toContain('Clip: harbour.mp4')
    expect((await ai.status()).usage.inputTokens).toBe(900)
  })

  it('a dismissed moment does not come back on a later search', async () => {
    const { api, folder } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const input = { projectFolder: folder, mediaId, fileName: 'harbour.mp4', durationMs: 25000 }
    await api.invoke('analysis:suggestions:findMoments', input)

    const dismissed = await api.invoke('analysis:suggestions:dismiss', {
      projectFolder: folder,
      mediaId,
      keys: ['moment:500-24600']
    })
    expect(dismissed).toEqual({
      ok: true,
      data: { tags: ['A-roll', 'outdoor', 'harbour'], moments: [] }
    })

    // A new search, and a fresh read from disk, still leave it out.
    const again = await api.invoke('analysis:suggestions:findMoments', input)
    expect(again.ok && again.data.moments).toEqual([])
    const saved = JSON.parse(
      await readFile(join(folder, 'analysis', 'suggestions', `${mediaId}.json`), 'utf8')
    )
    expect(saved.dismissed).toEqual(['moment:500-24600'])
  })

  it('dismissing a tag keeps it off the list', async () => {
    const { api, folder } = setup()
    const result = await api.invoke('analysis:suggestions:dismiss', {
      projectFolder: folder,
      mediaId,
      keys: ['tag:a-roll']
    })
    expect(result).toEqual({
      ok: true,
      data: { tags: ['outdoor', 'harbour'], moments: [] }
    })
  })

  it('analysis:suggestions:findMoments explains a missing key and sends nothing', async () => {
    const { api, sent, folder } = setup()
    const result = await api.invoke('analysis:suggestions:findMoments', {
      projectFolder: folder,
      mediaId,
      fileName: 'harbour.mp4'
    })
    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('analysis:suggestions:read refuses a media id that is not a plain id', async () => {
    const { api, folder } = setup()
    const result = await api.invoke('analysis:suggestions:read', {
      projectFolder: folder,
      mediaId: '../escape'
    })
    expect(result.ok).toBe(false)
  })
})
