// Finds the video encoder for exports, once at startup. It asks the bundled FFmpeg which encoders it
// was built with and reads its version. It runs only `-version` and `-encoders`: no frame is encoded,
// so it is quick and needs no footage. A hardware encoder that is built in but has no working GPU is
// not caught here; the render queue (#152) reports that when it runs.
import { runTool } from '../media/runTool'
import {
  chooseEncoder,
  parseEncoderNames,
  parseFfmpegVersion,
  supportsAmixNormalize,
  SOFTWARE_ENCODER,
  type EncoderInfo,
  type FfmpegVersion
} from '@shared/export/exportSettings'

export type ToolRunner = (bin: string, args: readonly string[]) => Promise<string>

const runWithoutCallbacks: ToolRunner = (bin, args) => runTool(bin, args)

export async function detectEncoder(
  ffmpeg: string,
  run: ToolRunner = runWithoutCallbacks
): Promise<EncoderInfo> {
  let version: FfmpegVersion | null = null
  let names: string[] = []
  try {
    version = parseFfmpegVersion(await run(ffmpeg, ['-hide_banner', '-version']))
  } catch {
    version = null
  }
  try {
    names = parseEncoderNames(await run(ffmpeg, ['-hide_banner', '-encoders']))
  } catch {
    names = []
  }
  const choice = chooseEncoder(names)
  return {
    encoder: choice.encoder,
    hardware: choice.hardware,
    fallback: choice.fallback,
    ffmpegVersion: version?.text ?? null,
    amixNormalizeSupported: supportsAmixNormalize(version)
  }
}

// The answer when FFmpeg cannot be run at all: x264 with no version known, so exports stay disabled
// by the caller rather than guessed at.
export function unknownEncoder(): EncoderInfo {
  return {
    encoder: SOFTWARE_ENCODER,
    hardware: false,
    fallback: true,
    ffmpegVersion: null,
    amixNormalizeSupported: false
  }
}
