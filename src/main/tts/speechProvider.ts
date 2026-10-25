// The seam between speech generation and a voice service. The service depends on this interface, so
// tests pass a fake provider and CI never reaches the network or needs a key.
import type { TtsVoice } from '@shared/tts/speech'

export interface SynthesisRequest {
  voiceId: string
  text: string
}

export interface SpeechProvider {
  /** The voices the account can use, sorted by name. */
  listVoices: () => Promise<TtsVoice[]>
  /** Speaks the text in one voice. Resolves the encoded audio bytes (MP3). */
  synthesize: (request: SynthesisRequest) => Promise<Buffer>
}
