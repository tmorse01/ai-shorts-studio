// The speech-to-text engine behind an interface. The transcript stage only sees SpeechEngine, so tests
// pass a fake. The real engine (Parakeet through sherpa-onnx) is loaded on first use and kept for the
// rest of the session, because loading the model takes seconds and a lot of memory.
import type { RawSpeechResult } from '@shared/analysis/transcript'
import type { SpeechModelPaths } from './speechModel'

// Parakeet expects 16 kHz mono audio.
export const SPEECH_SAMPLE_RATE = 16000

export interface SpeechEngine {
  /** Transcribes mono float samples in [-1, 1]. Empty or silent audio yields an empty result. */
  transcribe: (
    samples: Float32Array,
    sampleRate: number,
    signal?: AbortSignal
  ) => Promise<RawSpeechResult>
}

export type SpeechEngineLoader = (files: SpeechModelPaths) => Promise<SpeechEngine>

// The part of sherpa-onnx-node this app uses. Declared here so the rest of the code never sees the
// package's own types, and so tests never load the native addon.
export interface SherpaOfflineStream {
  acceptWaveform: (waveform: { samples: Float32Array; sampleRate: number }) => void
}
export interface SherpaOfflineResult {
  text: string
  tokens: string[]
  timestamps: number[]
  durations?: number[]
}
export interface SherpaOfflineRecognizer {
  createStream: () => SherpaOfflineStream
  decode: (stream: SherpaOfflineStream) => void
  getResult: (stream: SherpaOfflineStream) => SherpaOfflineResult
}
export interface SherpaModule {
  OfflineRecognizer: new (config: Record<string, unknown>) => SherpaOfflineRecognizer
}

/**
 * Builds the Parakeet engine from downloaded files. The sherpa-onnx addon is imported here, not at
 * app start, so the app loads it only when a transcript is first made.
 */
export const loadParakeetEngine: SpeechEngineLoader = async (files) => {
  const sherpa = (await import('sherpa-onnx-node')) as unknown as SherpaModule
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SPEECH_SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: files['encoder.int8.onnx'],
        decoder: files['decoder.int8.onnx'],
        joiner: files['joiner.int8.onnx']
      },
      tokens: files['tokens.txt'],
      modelType: 'nemo_transducer',
      numThreads: 4,
      // The npm build of sherpa-onnx runs on the CPU. GPU use needs a different build.
      provider: 'cpu',
      debug: false
    },
    decodingMethod: 'greedy_search'
  })
  return {
    transcribe: async (samples, sampleRate) => {
      const stream = recognizer.createStream()
      stream.acceptWaveform({ samples, sampleRate })
      recognizer.decode(stream)
      const result = recognizer.getResult(stream)
      return {
        text: result.text,
        tokens: result.tokens,
        timestamps: result.timestamps,
        durations: result.durations
      }
    }
  }
}
