// Deterministic stand-ins for the three providers, used only in E2E mode. They never touch the
// network or the speech model. Each one returns the same answer on every run, so specs can assert on
// it. FFmpeg is never faked here.
import type { RawSpeechResult } from '@shared/analysis/transcript'
import type { TtsVoice } from '@shared/tts/speech'
import type { AnthropicClient } from '../ai/anthropicClient'
import type { SpeechEngineLoader } from '../transcription/speechEngine'
import type { TranscriptTools } from '../transcription/transcriptStage'
import type { SpeechProvider } from '../tts/speechProvider'
import type { SpeechKeyStore } from '../tts/speechService'

export const FAKE_CLAUDE_REPLY = '[]'
export const FAKE_VOICE: TtsVoice = { id: 'e2e-voice', name: 'E2E Voice' }
// The key the fake speech provider is given when no ElevenLabs key is saved. The fake never sends it anywhere.
export const E2E_SPEECH_KEY = 'e2e-speech-key'
// Five words, one every few tenths of a second from 0 s, so captions appear at the start of the short.
export const FAKE_TRANSCRIPT: RawSpeechResult = {
  text: 'Hello there from the narration',
  tokens: ['▁Hello', '▁there', '▁from', '▁the', '▁narration'],
  timestamps: [0, 0.4, 0.8, 1.1, 1.4],
  durations: [0.4, 0.4, 0.3, 0.3, 0.6]
}

export function createFakeAnthropicClient(): AnthropicClient {
  return {
    sendMessage: async () => ({
      text: FAKE_CLAUDE_REPLY,
      usage: { inputTokens: 0, outputTokens: 0 }
    })
  }
}

// Without a saved key the speech service refuses to list voices, so E2E runs would never reach the fake
// provider. This store answers with the fake key when none is saved and delegates everything else.
export function withFakeSpeechKey(keys: SpeechKeyStore): SpeechKeyStore {
  return {
    speechKeyStorageAvailable: () => keys.speechKeyStorageAvailable(),
    speechKey: async () => (await keys.speechKey()) ?? E2E_SPEECH_KEY,
    saveSpeechKey: (apiKey) => keys.saveSpeechKey(apiKey),
    clearSpeechKey: () => keys.clearSpeechKey()
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
