// Generates speech from text: the provider's voices, a default voice per project, the cost estimate, and
// the cached audio file that narration clips use. The key comes from the AI settings' secret store, so
// it is encrypted and never written to a project folder. Every rule (cache key, cost) lives in pure
// modules; this class wires them to the key, the disk and the provider.
import { UserFacingError } from '../errors'
import {
  speechCostUsd,
  SPEECH_MODEL_ID,
  SPEECH_PROVIDER,
  type SpeechEstimate,
  type SpeechStatus,
  type TtsVoice
} from '@shared/tts/speech'
import type { SpeechSettings } from '@shared/tts/speechSettings'
import type { SpeechProvider } from './speechProvider'
import { speechCacheExists, speechCacheKey, speechCachePath, writeSpeechCache } from './speechCache'
import { loadSpeechSettings, saveSpeechSettings } from './speechSettingsFile'

/** The part of AiService that holds the speech key. Tests pass a fake. */
export interface SpeechKeyStore {
  speechKeyStorageAvailable: () => boolean
  speechKey: () => Promise<string | null>
  saveSpeechKey: (apiKey: string) => Promise<void>
  clearSpeechKey: () => Promise<void>
}

export interface SpeechServiceOptions {
  keys: SpeechKeyStore
  /** Builds the provider for a key. Tests pass a fake, so no request leaves the machine. */
  createProvider: (apiKey: string) => SpeechProvider
}

export interface SpeechVoices {
  voices: TtsVoice[]
  defaultVoiceId: string | null
}

export interface SpeechRequest {
  projectFolder: string
  voiceId: string
  text: string
}

export interface SpeechResult {
  audioPath: string
  characters: number
  cached: boolean
}

export class SpeechService {
  constructor(private readonly options: SpeechServiceOptions) {}

  async status(): Promise<SpeechStatus> {
    const key = await this.options.keys.speechKey()
    return {
      provider: SPEECH_PROVIDER,
      model: SPEECH_MODEL_ID,
      hasKey: key !== null,
      keyStorageAvailable: this.options.keys.speechKeyStorageAvailable()
    }
  }

  async saveKey(apiKey: string): Promise<SpeechStatus> {
    await this.options.keys.saveSpeechKey(apiKey)
    return this.status()
  }

  async clearKey(): Promise<SpeechStatus> {
    await this.options.keys.clearSpeechKey()
    return this.status()
  }

  /** The provider's voices and this project's default voice. */
  async voices(projectFolder: string): Promise<SpeechVoices> {
    const provider = await this.provider()
    const [voices, settings] = await Promise.all([
      provider.listVoices(),
      loadSpeechSettings(projectFolder)
    ])
    return { voices, defaultVoiceId: settings.defaultVoiceId }
  }

  async setDefaultVoice(
    projectFolder: string,
    defaultVoiceId: string | null
  ): Promise<SpeechSettings> {
    const settings: SpeechSettings = { defaultVoiceId }
    await saveSpeechSettings(projectFolder, settings)
    return settings
  }

  /** What speaking the text would cost, or nothing when the same audio is already cached. */
  async estimate({ projectFolder, voiceId, text }: SpeechRequest): Promise<SpeechEstimate> {
    const key = speechCacheKey({ voiceId, text })
    const cached = await speechCacheExists(projectFolder, key)
    const characters = [...text].length
    return { characters, costUsd: speechCostUsd(characters, cached), cached }
  }

  /** Speaks the text, or returns the cached audio when this voice and text were already made. */
  async generate({ projectFolder, voiceId, text }: SpeechRequest): Promise<SpeechResult> {
    const key = speechCacheKey({ voiceId, text })
    const characters = [...text].length
    if (await speechCacheExists(projectFolder, key)) {
      return { audioPath: speechCachePath(projectFolder, key), characters, cached: true }
    }
    const provider = await this.provider()
    const audio = await provider.synthesize({ voiceId, text })
    const audioPath = await writeSpeechCache(projectFolder, key, audio)
    return { audioPath, characters, cached: false }
  }

  private async provider(): Promise<SpeechProvider> {
    const key = await this.options.keys.speechKey()
    if (!key) throw new UserFacingError('Add an ElevenLabs key in Settings first.')
    return this.options.createProvider(key)
  }
}
