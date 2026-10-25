import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { AiService } from '../src/main/ai/aiService'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import type { SecretStore } from '../src/main/ai/secretStore'
import { SpeechService } from '../src/main/tts/speechService'
import type { SpeechProvider } from '../src/main/tts/speechProvider'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'

// No request leaves the test: the speech provider is a fake and the key lives in memory.
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

const KEY = 'el-test-key-0000000000000000'
const speechCalls: string[] = []

const fakeProvider: SpeechProvider = {
  listVoices: async () => [{ id: 'voice-1', name: 'Adam', category: 'premade' }],
  synthesize: async ({ voiceId, text }) => {
    speechCalls.push(`${voiceId}:${text}`)
    return Buffer.from('fake-mp3')
  }
}

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'tts-ipc-'))
  const ai = new AiService({
    secrets: memorySecrets(),
    speechSecrets: memorySecrets(),
    state: memoryAiStateStorage(),
    createClient: () => ({
      sendMessage: async () => ({ text: 'OK', usage: { inputTokens: 1, outputTokens: 1 } })
    })
  })
  const speech = new SpeechService({ keys: ai, createProvider: () => fakeProvider })
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(pendingForever()),
    ai,
    speech
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { folder, api }
}

describe('text-to-speech IPC round trip', () => {
  it('tts:status reports no key, then the key is saved and never echoed', async () => {
    const { api } = setup()

    const before = await api.invoke('tts:status', {})
    expect(before).toMatchObject({ ok: true, data: { hasKey: false, keyStorageAvailable: true } })

    const saved = await api.invoke('tts:key:save', { apiKey: KEY })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.data.hasKey).toBe(true)
    expect(JSON.stringify(saved.data)).not.toContain(KEY)
  })

  it('tts:key:save rejects a key with spaces or that is too short', async () => {
    const { api } = setup()

    expect(await api.invoke('tts:key:save', { apiKey: 'short' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' }
    })
    expect(
      await api.invoke('tts:key:save', { apiKey: 'has spaces in this key 000000' })
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' }
    })
  })

  it('tts:key:clear removes the saved key', async () => {
    const { api } = setup()
    await api.invoke('tts:key:save', { apiKey: KEY })

    const cleared = await api.invoke('tts:key:clear', {})
    expect(cleared).toMatchObject({ ok: true, data: { hasKey: false } })
  })

  it('tts:voices lists the voices and the project default', async () => {
    const { folder, api } = setup()
    await api.invoke('tts:key:save', { apiKey: KEY })

    const result = await api.invoke('tts:voices', { projectFolder: folder })

    expect(result).toMatchObject({
      ok: true,
      data: { voices: [{ id: 'voice-1', name: 'Adam', category: 'premade' }], defaultVoiceId: null }
    })
  })

  it('tts:defaultVoice:set stores the project default voice', async () => {
    const { folder, api } = setup()
    await api.invoke('tts:key:save', { apiKey: KEY })

    const set = await api.invoke('tts:defaultVoice:set', {
      projectFolder: folder,
      defaultVoiceId: 'voice-1'
    })
    expect(set).toEqual({ ok: true, data: { defaultVoiceId: 'voice-1' } })

    const voices = await api.invoke('tts:voices', { projectFolder: folder })
    expect(voices).toMatchObject({ ok: true, data: { defaultVoiceId: 'voice-1' } })
  })

  it('tts:estimate prices the text before anything is generated', async () => {
    const { folder, api } = setup()

    const result = await api.invoke('tts:estimate', {
      projectFolder: folder,
      voiceId: 'voice-1',
      text: 'Hello there.'
    })

    expect(result).toMatchObject({ ok: true, data: { characters: 12, cached: false } })
    expect(speechCalls).toHaveLength(0)
  })

  it('tts:generate writes the audio into the cache, and a repeat is served from it', async () => {
    const { folder, api } = setup()
    await api.invoke('tts:key:save', { apiKey: KEY })
    speechCalls.length = 0
    const input = { projectFolder: folder, voiceId: 'voice-1', text: 'Cache me.' }

    const first = await api.invoke('tts:generate', input)
    const second = await api.invoke('tts:generate', input)

    expect(first.ok && first.data.cached).toBe(false)
    expect(second.ok && second.data.cached).toBe(true)
    if (!first.ok) return
    expect(existsSync(first.data.audioPath)).toBe(true)
    expect(speechCalls).toEqual(['voice-1:Cache me.'])
  })

  it('tts:generate without a key fails with a plain message and sends nothing', async () => {
    const { folder, api } = setup()
    speechCalls.length = 0

    const result = await api.invoke('tts:generate', {
      projectFolder: folder,
      voiceId: 'voice-1',
      text: 'No key.'
    })

    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).toContain('Add an ElevenLabs key in Settings first.')
    expect(speechCalls).toHaveLength(0)
  })

  it('tts:generate rejects empty text and text over the request limit', async () => {
    const { folder, api } = setup()

    const empty = await api.invoke('tts:generate', {
      projectFolder: folder,
      voiceId: 'v',
      text: '  '
    })
    const long = await api.invoke('tts:generate', {
      projectFolder: folder,
      voiceId: 'v',
      text: 'a'.repeat(5001)
    })

    expect(empty).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    expect(long).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
