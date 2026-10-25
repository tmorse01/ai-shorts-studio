import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SpeechService, type SpeechKeyStore } from '../src/main/tts/speechService'
import type { SpeechProvider } from '../src/main/tts/speechProvider'
import { speechCostUsd, SPEECH_USD_PER_1K_CHARS } from '@shared/tts/speech'
import { UserFacingError } from '../src/main/errors'

function memoryKeys(
  initial: string | null = null
): SpeechKeyStore & { value: () => string | null } {
  let value = initial
  return {
    speechKeyStorageAvailable: () => true,
    speechKey: async () => value,
    saveSpeechKey: async (key) => {
      value = key
    },
    clearSpeechKey: async () => {
      value = null
    },
    value: () => value
  }
}

// A provider that never reaches the network. It counts synthesis calls so cache hits are visible.
function fakeProvider() {
  const synthesized: { voiceId: string; text: string }[] = []
  const provider: SpeechProvider = {
    listVoices: async () => [
      { id: 'v2', name: 'Zoe' },
      { id: 'v1', name: 'Adam' }
    ],
    synthesize: async (request) => {
      synthesized.push(request)
      return Buffer.from(`audio:${request.voiceId}:${request.text}`)
    }
  }
  return { provider, synthesized }
}

function setup(initialKey: string | null = 'test-key-000000000000') {
  const folder = mkdtempSync(join(tmpdir(), 'tts-service-'))
  const keys = memoryKeys(initialKey)
  const { provider, synthesized } = fakeProvider()
  const service = new SpeechService({ keys, createProvider: () => provider })
  return { folder, keys, service, synthesized }
}

describe('speech cost estimate', () => {
  it('prices characters per thousand, and a cached clip costs nothing', () => {
    expect(speechCostUsd(1000, false)).toBeCloseTo(SPEECH_USD_PER_1K_CHARS, 4)
    expect(speechCostUsd(1000, true)).toBe(0)
    expect(speechCostUsd(0, false)).toBe(0)
  })

  it('reports the characters and whether the audio is already cached', async () => {
    const { folder, service } = setup()
    const request = { projectFolder: folder, voiceId: 'v1', text: 'Hello there.' }

    expect(await service.estimate(request)).toEqual({
      characters: 12,
      costUsd: speechCostUsd(12, false),
      cached: false
    })

    await service.generate(request)
    expect(await service.estimate(request)).toEqual({ characters: 12, costUsd: 0, cached: true })
  })
})

describe('speech generation and the cache', () => {
  it('synthesizes once, then serves the same voice and text from the cache', async () => {
    const { folder, service, synthesized } = setup()
    const request = { projectFolder: folder, voiceId: 'v1', text: 'Line one.' }

    const first = await service.generate(request)
    const second = await service.generate(request)

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.audioPath).toBe(first.audioPath)
    expect(synthesized).toHaveLength(1)
    expect(first.audioPath).toContain(join('cache', 'tts'))
    expect(first.audioPath.endsWith('.mp3')).toBe(true)
  })

  it('synthesizes again when the voice changes', async () => {
    const { folder, service, synthesized } = setup()

    await service.generate({ projectFolder: folder, voiceId: 'v1', text: 'Same text.' })
    const other = await service.generate({
      projectFolder: folder,
      voiceId: 'v2',
      text: 'Same text.'
    })

    expect(other.cached).toBe(false)
    expect(synthesized).toHaveLength(2)
  })

  it('refuses to generate without a saved key, and sends nothing', async () => {
    const { folder, service, synthesized } = setup(null)

    const error = await service
      .generate({ projectFolder: folder, voiceId: 'v1', text: 'Hi.' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as Error).message).toBe('Add an ElevenLabs key in Settings first.')
    expect(synthesized).toHaveLength(0)
  })
})

describe('speech voices and default voice', () => {
  it('lists the provider voices with no default until one is chosen', async () => {
    const { folder, service } = setup()

    const before = await service.voices(folder)
    expect(before.voices.map((voice) => voice.name)).toEqual(['Zoe', 'Adam'])
    expect(before.defaultVoiceId).toBeNull()

    await service.setDefaultVoice(folder, 'v1')
    expect((await service.voices(folder)).defaultVoiceId).toBe('v1')

    await service.setDefaultVoice(folder, null)
    expect((await service.voices(folder)).defaultVoiceId).toBeNull()
  })

  it('keeps the default voice per project folder', async () => {
    const one = setup()
    const two = mkdtempSync(join(tmpdir(), 'tts-service-two-'))

    await one.service.setDefaultVoice(one.folder, 'v2')

    expect((await one.service.voices(one.folder)).defaultVoiceId).toBe('v2')
    expect((await one.service.voices(two)).defaultVoiceId).toBeNull()
  })
})

describe('speech key handling', () => {
  it('reports status without the key, and clears it on request', async () => {
    const { service, keys } = setup(null)

    expect(await service.status()).toEqual({
      provider: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      hasKey: false,
      keyStorageAvailable: true
    })

    const saved = await service.saveKey('test-key-000000000000')
    expect(saved.hasKey).toBe(true)
    expect(JSON.stringify(saved)).not.toContain('test-key-000000000000')

    const cleared = await service.clearKey()
    expect(cleared.hasKey).toBe(false)
    expect(keys.value()).toBeNull()
  })
})
