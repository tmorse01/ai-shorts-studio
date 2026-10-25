// Deterministic stand-ins for the three providers, used only in E2E mode. They never touch the
// network or the speech model. Each one returns the same answer on every run, so specs can assert on
// it. FFmpeg is never faked here.
import type { RawSpeechResult } from '@shared/analysis/transcript'
import type { TtsVoice } from '@shared/tts/speech'
import type { AnthropicClient } from '../ai/anthropicClient'
import type { SpeechEngineLoader } from '../transcription/speechEngine'
import type { TranscriptTools } from '../transcription/transcriptStage'
import type { SpeechProvider } from '../tts/speechProvider'

export const FAKE_CLAUDE_REPLY = '[]'
export const FAKE_VOICE: TtsVoice = { id: 'e2e-voice', name: 'E2E Voice' }
export const FAKE_TRANSCRIPT: RawSpeechResult = { text: '', tokens: [], timestamps: [] }

export function createFakeAnthropicClient(): AnthropicClient {
  return {
    sendMessage: async () => ({
      text: FAKE_CLAUDE_REPLY,
      usage: { inputTokens: 0, outputTokens: 0 }
    })
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
