import { describe, expect, it } from 'vitest'
import { detectEncoder, unknownEncoder, type ToolRunner } from '../src/main/export/encoderDetection'

const VERSION = 'ffmpeg version 6.1.1-essentials_build-www.gyan.dev Copyright (c) 2000-2023\n'
const ENCODERS_WITH_NVENC = ` V....D h264_nvenc  NVIDIA NVENC H.264 encoder (codec h264)
 V....D libx264  libx264 H.264 (codec h264)
`
const ENCODERS_X264_ONLY = ` V....D libx264  libx264 H.264 (codec h264)
`

// A fake runner: it answers the two detection calls and never runs an encode.
function fakeRunner(version: string | Error, encoders: string | Error): ToolRunner {
  return async (_bin, args) => {
    const answer = args.includes('-version') ? version : encoders
    if (answer instanceof Error) throw answer
    return answer
  }
}

describe('detectEncoder', () => {
  it('picks a hardware encoder and reports the bundled FFmpeg version', async () => {
    const info = await detectEncoder('ffmpeg.exe', fakeRunner(VERSION, ENCODERS_WITH_NVENC))
    expect(info).toEqual({
      encoder: 'h264_nvenc',
      hardware: true,
      fallback: false,
      ffmpegVersion: '6.1.1',
      amixNormalizeSupported: true
    })
  })

  it('falls back to x264 when no hardware encoder is built in', async () => {
    const info = await detectEncoder('ffmpeg.exe', fakeRunner(VERSION, ENCODERS_X264_ONLY))
    expect(info.encoder).toBe('libx264')
    expect(info.hardware).toBe(false)
    expect(info.fallback).toBe(true)
  })

  it('flags an FFmpeg older than 5.0 as unable to mix audio', async () => {
    const info = await detectEncoder(
      'ffmpeg.exe',
      fakeRunner('ffmpeg version n4.4.2', ENCODERS_X264_ONLY)
    )
    expect(info.ffmpegVersion).toBe('4.4.2')
    expect(info.amixNormalizeSupported).toBe(false)
  })

  it('still answers with x264 and no version when FFmpeg cannot run', async () => {
    const info = await detectEncoder(
      'missing.exe',
      fakeRunner(new Error('ENOENT'), new Error('ENOENT'))
    )
    expect(info).toEqual(unknownEncoder())
  })
})
