// Deterministic stand-ins for the three providers, used only in E2E mode. They never touch the
// network or the speech model. Each one returns the same answer on every run, so specs can assert on
// it. FFmpeg is never faked here.
import { WORD_MARK, type RawSpeechResult } from '@shared/analysis/transcript'
import type { TtsVoice } from '@shared/tts/speech'
import type { AnthropicClient } from '../ai/anthropicClient'
import type { SecretStore } from '../ai/secretStore'
import type { SpeechEngineLoader } from '../transcription/speechEngine'
import type { TranscriptTools } from '../transcription/transcriptStage'
import type { SpeechProvider } from '../tts/speechProvider'

// Replies for every request that is not a moment search. A JSON array with no items.
export const FAKE_CLAUDE_REPLY = '[]'
// The reply to a moment search (the prompt asks for "startSec"). Two candidates on the fixed transcript.
export const FAKE_MOMENT_REPLY = JSON.stringify([
  { name: 'Lantern market welcome', startSec: 0, endSec: 8, note: 'Opening welcome', score: 80 },
  { name: 'River bridges', startSec: 8, endSec: 16, note: 'Walk along the river', score: 65 }
])
export const FAKE_VOICE: TtsVoice = { id: 'e2e-voice', name: 'E2E Voice' }
export const FAKE_API_KEY = 'e2e-fake-anthropic-key'

// The fixed speech: two sentences, one word every 1.2 s from 1 s, so every word has a known time.
const FAKE_WORDS = [
  'Welcome',
  'to',
  'the',
  'lantern',
  'market.',
  'Today',
  'we',
  'follow',
  'the',
  'river',
  'bridges.'
]
const FAKE_WORD_STEP_S = 1.2
const FAKE_WORD_LEAD_S = 1
const FAKE_WORD_LENGTH_S = 1

export const FAKE_TRANSCRIPT: RawSpeechResult = {
  text: FAKE_WORDS.join(' '),
  tokens: FAKE_WORDS.map((word) => WORD_MARK + word),
  timestamps: FAKE_WORDS.map((_, i) => FAKE_WORD_LEAD_S + i * FAKE_WORD_STEP_S),
  durations: FAKE_WORDS.map(() => FAKE_WORD_LENGTH_S)
}

// A vision reply that describes shots 0 to 199. The reader keeps only the shots a batch asked for, so
// every shot of a short clip gets a description.
const FAKE_VISION_REPLY = JSON.stringify(
  Array.from({ length: 200 }, (_, shot) => ({
    shot,
    description: 'A fixed test frame.',
    tags: ['test pattern']
  }))
)

export function createFakeAnthropicClient(): AnthropicClient {
  return {
    sendMessage: async ({ prompt, images }) => ({
      text: fakeReplyFor(prompt, images),
      usage: { inputTokens: 0, outputTokens: 0 }
    })
  }
}

function fakeReplyFor(prompt: string, images: unknown[] | undefined): string {
  if (images && images.length > 0) return FAKE_VISION_REPLY
  return prompt.includes('"startSec"') ? FAKE_MOMENT_REPLY : FAKE_CLAUDE_REPLY
}

/** The Anthropic key store in E2E mode: a key is always saved, so the AI features run on the fakes. */
export function createFakeAnthropicSecrets(): SecretStore {
  return {
    isAvailable: () => true,
    read: async () => FAKE_API_KEY,
    write: async () => {},
    clear: async () => {}
  }
}

export function createFakeSpeechProvider(): SpeechProvider {
  return {
    listVoices: async () => [FAKE_VOICE],
    synthesize: async () => silentWav(0.5)
  }
}

export const loadFakeSpeechEngine: SpeechEngineLoader = async () => ({
  transcribe: async () => FAKE_TRANSCRIPT
})

/** Swaps the speech model and engine for fakes. Decoding the audio stays real, so FFmpeg still runs. */
export function withFakeSpeech(tools: TranscriptTools): TranscriptTools {
  return {
    ...tools,
    ensureModel: async (onProgress) => {
      onProgress(1)
      return {}
    },
    loadEngine: loadFakeSpeechEngine
  }
}

// A 16 kHz mono, 16-bit silent WAV file of the given length.
export function silentWav(seconds: number): Buffer {
  const sampleRate = 16000
  const dataBytes = Math.round(seconds * sampleRate) * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  return buffer
}
