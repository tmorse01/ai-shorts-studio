import { describe, expect, it } from 'vitest'
import { runExportJob, type ExportDeps, type ExportJobInput } from '../src/main/export/exportJob'
import { UserFacingError } from '../src/main/errors'
import type { Timeline } from '@shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

const timeline: Timeline = {
  tracks: [
    {
      id: 'main',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [
        {
          id: 'c1',
          mediaId: 'cam-a',
          startMs: 0,
          durationMs: 4000,
          sourceInMs: 0,
          transform: IDENTITY
        }
      ]
    }
  ]
}

const input: ExportJobInput = {
  timeline,
  media: [{ id: 'cam-a', path: 'C:/footage/cam-a.mp4' }],
  encoder: 'h264_nvenc',
  fps: 30,
  videoKbps: 10000,
  audioKbps: 192,
  outPath: 'C:/out/Demo.mp4'
}

// The encoder each run asked for, read from the -c:v argument. The runner is a fake: nothing is encoded.
function encoderOf(args: readonly string[]): string {
  return args[args.indexOf('-c:v') + 1] ?? ''
}

function deps(
  failing: string[],
  overrides: Partial<ExportDeps> = {}
): { deps: ExportDeps; tried: string[] } {
  const tried: string[] = []
  return {
    tried,
    deps: {
      ffmpeg: 'ffmpeg.exe',
      probe: async () => ({
        durationSec: 4,
        video: { width: 1920, height: 1080, fps: 30, codec: 'h264', rotation: 0 },
        audio: []
      }),
      run: async (_bin, args) => {
        const encoder = encoderOf(args)
        tried.push(encoder)
        if (failing.includes(encoder)) {
          throw new UserFacingError('This file could not be exported.', 'Cannot load nvcuda.dll')
        }
        return ''
      },
      commit: async () => undefined,
      discard: async () => undefined,
      makeFolder: async () => undefined,
      ...overrides
    }
  }
}

describe('runExportJob encoder fallback', () => {
  it('retries a failed hardware encode once with libx264 and reports the fallback', async () => {
    const fallbacks: string[] = []
    const { deps: fake, tried } = deps(['h264_nvenc'], {
      onEncoderFallback: (encoder) => fallbacks.push(encoder)
    })
    await runExportJob(input, fake)
    expect(tried).toEqual(['h264_nvenc', 'libx264'])
    expect(fallbacks).toEqual(['libx264'])
  })

  it('fails the job when libx264 also fails, without a third attempt', async () => {
    const { deps: fake, tried } = deps(['h264_nvenc', 'libx264'])
    await expect(runExportJob(input, fake)).rejects.toThrow('This file could not be exported.')
    expect(tried).toEqual(['h264_nvenc', 'libx264'])
  })

  it('does not retry when the encode succeeds the first time', async () => {
    const { deps: fake, tried } = deps([])
    await runExportJob(input, fake)
    expect(tried).toEqual(['h264_nvenc'])
  })
})
