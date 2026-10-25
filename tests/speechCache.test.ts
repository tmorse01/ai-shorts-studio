import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  speechCacheDir,
  speechCacheExists,
  speechCacheKey,
  speechCachePath,
  writeSpeechCache
} from '../src/main/tts/speechCache'

describe('speech cache key', () => {
  it('is the same for the same voice, text and model', () => {
    const a = speechCacheKey({ voiceId: 'voice-a', text: 'Hello there.' })
    const b = speechCacheKey({ voiceId: 'voice-a', text: 'Hello there.' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when the voice, the text or the model changes', () => {
    const base = speechCacheKey({ voiceId: 'voice-a', text: 'Hello there.' })
    expect(speechCacheKey({ voiceId: 'voice-b', text: 'Hello there.' })).not.toBe(base)
    expect(speechCacheKey({ voiceId: 'voice-a', text: 'Hello there!' })).not.toBe(base)
    expect(
      speechCacheKey({ voiceId: 'voice-a', text: 'Hello there.', modelId: 'other-model' })
    ).not.toBe(base)
  })

  it('does not confuse text that only differs in where the words split', () => {
    // A naive join of voice and text would collide here. The JSON encoding keeps them apart.
    const one = speechCacheKey({ voiceId: 'a', text: 'b|c' })
    const two = speechCacheKey({ voiceId: 'a|b', text: 'c' })
    expect(one).not.toBe(two)
  })

  it('places audio under the project cache folder as an MP3 named by the key', () => {
    const key = speechCacheKey({ voiceId: 'voice-a', text: 'Hi' })
    expect(speechCacheDir('/proj')).toBe(join('/proj', 'cache', 'tts'))
    expect(speechCachePath('/proj', key)).toBe(join('/proj', 'cache', 'tts', `${key}.mp3`))
  })
})

describe('speech cache files', () => {
  it('writes the audio and reports it as existing', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'tts-cache-'))
    const key = speechCacheKey({ voiceId: 'voice-a', text: 'Hi' })

    expect(await speechCacheExists(folder, key)).toBe(false)
    const path = await writeSpeechCache(folder, key, Buffer.from('audio-bytes'))

    expect(path).toBe(speechCachePath(folder, key))
    expect(await speechCacheExists(folder, key)).toBe(true)
    expect(readFileSync(path).toString()).toBe('audio-bytes')
    // The temp file is renamed away, so only the finished clip is left.
    expect(readdirSync(speechCacheDir(folder))).toEqual([`${key}.mp3`])
  })
})
