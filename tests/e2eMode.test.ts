import { describe, expect, it } from 'vitest'
import { DEFAULT_VISION_MODEL } from '../src/shared/ai/aiSettings'
import { join } from 'node:path'
import {
  E2E_DIALOGS_FILE,
  isE2eMode,
  isolatedProfile,
  parseDialogPicks,
  readDialogPicks
} from '../src/main/e2e/e2eMode'
import {
  FAKE_CLAUDE_REPLY,
  createFakeAnthropicClient,
  withFakeSpeech,
  loadFakeSpeechEngine
} from '../src/main/e2e/fakes'
import type { TranscriptTools } from '../src/main/transcription/transcriptStage'

describe('E2E mode switch', () => {
  it('is on only when AISS_E2E is exactly 1', () => {
    expect(isE2eMode({ AISS_E2E: '1' })).toBe(true)
    expect(isE2eMode({ AISS_E2E: '0' })).toBe(false)
    expect(isE2eMode({ AISS_E2E: 'true' })).toBe(false)
    expect(isE2eMode({})).toBe(false)
  })

  it('isolates the profile and documents folders under AISS_USER_DATA', () => {
    expect(isolatedProfile({})).toBeNull()
    expect(isolatedProfile({ AISS_USER_DATA: '/tmp/run-1' })).toEqual({
      userData: '/tmp/run-1',
      documents: join('/tmp/run-1', 'Documents')
    })
  })

  it('reads the test-set picks and treats anything malformed as no picks', () => {
    expect(parseDialogPicks({ folder: 'C:/x', media: ['a.mp4'] })).toEqual({
      folder: 'C:/x',
      media: ['a.mp4']
    })
    expect(parseDialogPicks({ media: 'a.mp4' })).toEqual({ folder: null, media: [] })
    expect(parseDialogPicks(null)).toEqual({ folder: null, media: [] })

    const seen: string[] = []
    const picks = readDialogPicks('/profile', (file) => {
      seen.push(file)
      return JSON.stringify({ media: ['clip.mp4'] })
    })
    expect(seen).toEqual([join('/profile', E2E_DIALOGS_FILE)])
    expect(picks).toEqual({ folder: null, media: ['clip.mp4'] })
    expect(
      readDialogPicks('/profile', () => {
        throw new Error('missing')
      })
    ).toEqual({ folder: null, media: [] })
  })
})

describe('E2E fakes', () => {
  it('answers Claude with the same reply every time', async () => {
    const client = createFakeAnthropicClient()
    const request = { model: DEFAULT_VISION_MODEL, maxTokens: 10, prompt: 'hi' }
    const first = await client.sendMessage(request)
    const second = await client.sendMessage(request)
    expect(first.text).toBe(FAKE_CLAUDE_REPLY)
    expect(second).toEqual(first)
  })

  it('swaps the speech model and engine but keeps the audio decoder', async () => {
    const decodeAudio = async () => null
    const real: TranscriptTools = {
      decodeAudio,
      ensureModel: async () => {
        throw new Error('real model must not load in E2E mode')
      },
      loadEngine: async () => {
        throw new Error('real engine must not load in E2E mode')
      }
    }
    const tools = withFakeSpeech(real)
    expect(tools.decodeAudio).toBe(decodeAudio)
    expect(tools.loadEngine).toBe(loadFakeSpeechEngine)
    const progress: number[] = []
    await expect(tools.ensureModel((fraction) => progress.push(fraction))).resolves.toEqual({})
    expect(progress).toEqual([1])
  })
})
