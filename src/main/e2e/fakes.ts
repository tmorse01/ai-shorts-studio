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

/** The lines every fake script has. Each one names "harbour", so the spec tags its clips to match. */
export const FAKE_SCRIPT_LINES = [
  'The harbour wakes before sunrise.',
  'Boats leave the harbour at dawn.',
  'Fishermen mend nets on the harbour wall.'
]
export const FAKE_SCRIPT_TOPIC = 'Harbour mornings'
export const FAKE_SCRIPT_TITLE = 'Harbour draft'
/** What the fake returns for any line rewrite, whichever action was asked for. */
export const FAKE_REWRITE = 'A sharper line about the harbour at dawn.'

let fakeScriptCount = 0

/**
 * Answers a request by its prompt, so each feature gets a reply it can read. Script drafts get the
 * number of scripts the prompt asks for. A rewrite gets FAKE_REWRITE. A footage match gets one pick per
 * line: the first candidate when the request has several lines, and the last candidate when it has one
 * line (a re-assemble), with the other candidate as the alternative. Anything else gets an empty list.
 */
export function fakeReply(prompt: string): string {
  if (prompt.includes('You write scripts for vertical short videos'))
    return fakeScriptsReply(prompt)
  if (prompt.includes('You edit one line of a script')) return FAKE_REWRITE
  if (prompt.includes('<script_lines>')) return fakeMatchReply(prompt)
  return FAKE_CLAUDE_REPLY
}

function fakeScriptsReply(prompt: string): string {
  const requested = Number(/Write (\d+) scripts? about/.exec(prompt)?.[1] ?? '1')
  const scripts = Array.from({ length: requested }, () => {
    fakeScriptCount += 1
    return {
      title: `${FAKE_SCRIPT_TITLE} ${fakeScriptCount}`,
      topic: FAKE_SCRIPT_TOPIC,
      lines: FAKE_SCRIPT_LINES.map((text) => ({ text }))
    }
  })
  return JSON.stringify({ scripts })
}

function fakeMatchReply(prompt: string): string {
  const blocks = [...prompt.matchAll(/<line id="([^"]+)"[^>]*>([\s\S]*?)<\/line>/g)]
  const single = blocks.length === 1
  const lines = blocks.flatMap(([, lineId, body]) => {
    const candidates = [...body.matchAll(/candidate (c\d+):/g)].map((match) => match[1])
    if (candidates.length === 0) return []
    const primary = single ? candidates[candidates.length - 1] : candidates[0]
    const alternatives = candidates.filter((id) => id !== primary).slice(0, 2)
    return [{ lineId, candidateId: primary, inMs: 0, outMs: 4000, alternatives }]
  })
  return JSON.stringify({ lines })
}

export function createFakeAnthropicClient(): AnthropicClient {
  return {
    sendMessage: async ({ prompt }) => ({
      text: fakeReply(prompt),
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
