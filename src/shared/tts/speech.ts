// Text-to-speech types and rules shared by main and renderer. Pure: no network, disk or Electron. The
// provider key is never here; it lives in the encrypted secret store in main.
import { z } from 'zod'

export const SPEECH_PROVIDER = 'elevenlabs' as const
export const SPEECH_MODEL_ID = 'eleven_multilingual_v2'
// Longest text sent in one request.
export const MAX_SPEECH_CHARS = 5000
// Planning number for the cost shown before generating. It estimates the provider's per-character
// price. It is never recorded as usage, and a cached result costs nothing.
export const SPEECH_USD_PER_1K_CHARS = 0.3
// The sentence used for voice previews. Short, so a preview is cheap and cached after the first play.
export const SPEECH_PREVIEW_TEXT = 'This is how this voice sounds with your script.'

export const ttsVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional()
})
export type TtsVoice = z.infer<typeof ttsVoiceSchema>

export const speechTextSchema = z.string().trim().min(1).max(MAX_SPEECH_CHARS)

export const speechStatusSchema = z.object({
  provider: z.literal(SPEECH_PROVIDER),
  model: z.literal(SPEECH_MODEL_ID),
  hasKey: z.boolean(),
  keyStorageAvailable: z.boolean()
})
export type SpeechStatus = z.infer<typeof speechStatusSchema>

export const speechEstimateSchema = z.object({
  characters: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  // True when the audio is already in the project cache, so generating it again costs nothing.
  cached: z.boolean()
})
export type SpeechEstimate = z.infer<typeof speechEstimateSchema>

/** The cost of speaking this many characters. A cached result costs nothing. */
export function speechCostUsd(characters: number, cached: boolean): number {
  if (cached || characters <= 0) return 0
  return Math.round((characters / 1000) * SPEECH_USD_PER_1K_CHARS * 10000) / 10000
}
