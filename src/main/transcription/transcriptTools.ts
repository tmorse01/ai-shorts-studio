// The real transcript tools: FFmpeg for the audio, the Parakeet files in app data, and the sherpa-onnx
// engine. Built once in the media job wiring; every piece it uses is tested on its own.
import { probeMedia } from '../media/probeMedia'
import { decodeAudioSamples } from './decodeAudio'
import { loadParakeetEngine } from './speechEngine'
import { PARAKEET_MODEL, ensureSpeechModel } from './speechModel'
import type { TranscriptTools } from './transcriptStage'

export interface TranscriptToolPaths {
  ffmpeg: () => string
  ffprobe: () => string
  /** App data folder that holds the downloaded speech models. */
  modelsRoot: string
}

export function realTranscriptTools(paths: TranscriptToolPaths): TranscriptTools {
  return {
    decodeAudio: async (path, signal) => {
      const probe = await probeMedia(path, { ffprobe: paths.ffprobe(), signal })
      return decodeAudioSamples(path, probe.audio.length > 0, paths.ffmpeg(), signal)
    },
    ensureModel: (onProgress, signal) =>
      ensureSpeechModel({
        modelsRoot: paths.modelsRoot,
        model: PARAKEET_MODEL,
        onProgress,
        signal
      }),
    loadEngine: loadParakeetEngine
  }
}
