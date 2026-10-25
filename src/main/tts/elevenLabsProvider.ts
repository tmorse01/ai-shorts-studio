// The ElevenLabs implementation of SpeechProvider. Only this file knows the provider's URLs and reply
// shapes. Failures become plain UserFacingError messages; the raw response never reaches the user.
import { z } from 'zod'
import { SPEECH_MODEL_ID, ttsVoiceSchema, type TtsVoice } from '@shared/tts/speech'
import { UserFacingError } from '../errors'
import type { SpeechProvider, SynthesisRequest } from './speechProvider'

export const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'
const OUTPUT_FORMAT = 'mp3_44100_128'
const REQUEST_TIMEOUT_MS = 60000

const voicesResponseSchema = z.object({
  voices: z.array(
    z.object({
      voice_id: z.string().min(1),
      name: z.string().min(1),
      category: z.string().optional()
    })
  )
})

export interface ElevenLabsProviderOptions {
  apiKey: string
  /** Replaced in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

/** The reply for a failed request, turned into a message the user can act on. */
export function speechErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'ElevenLabs did not accept the key. Check it in Settings.'
  }
  if (status === 429) return 'ElevenLabs is limiting requests right now. Try again in a minute.'
  if (status === 422 || status === 400) return 'ElevenLabs could not use this text or voice.'
  return 'The speech request failed. Try again later.'
}

async function send(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch {
    throw new UserFacingError('Could not reach ElevenLabs. Check the connection and try again.')
  }
  if (!response.ok) throw new UserFacingError(speechErrorMessage(response.status))
  return response
}

export function createElevenLabsProvider({
  apiKey,
  fetchImpl = fetch
}: ElevenLabsProviderOptions): SpeechProvider {
  const headers = { 'xi-api-key': apiKey }

  return {
    async listVoices(): Promise<TtsVoice[]> {
      const response = await send(fetchImpl, `${ELEVENLABS_BASE_URL}/voices`, {
        method: 'GET',
        headers
      })
      const parsed = voicesResponseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) {
        throw new UserFacingError('ElevenLabs sent a voice list this app could not read.')
      }
      const voices = parsed.data.voices.map((voice) =>
        ttsVoiceSchema.parse({
          id: voice.voice_id,
          name: voice.name,
          ...(voice.category ? { category: voice.category } : {})
        })
      )
      return voices.sort((a, b) => a.name.localeCompare(b.name))
    },

    async synthesize({ voiceId, text }: SynthesisRequest): Promise<Buffer> {
      const url =
        `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}` +
        `?output_format=${OUTPUT_FORMAT}`
      const response = await send(fetchImpl, url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: SPEECH_MODEL_ID })
      })
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length === 0) throw new UserFacingError('ElevenLabs returned no audio.')
      return bytes
    }
  }
}
