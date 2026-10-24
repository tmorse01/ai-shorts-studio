import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseProbeOutput } from '../src/main/media/parseProbe'
import { probeMedia } from '../src/main/media/probeMedia'
import { resolveBinary, type BinaryLocation } from '../src/main/media/binaries'
import { UserFacingError } from '../src/main/errors'

// The same ffprobe output shape the sample file gives, trimmed to the fields the parser reads.
const sampleFfprobe = {
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 320,
      height: 240,
      avg_frame_rate: '25/1',
      r_frame_rate: '25/1'
    },
    {
      index: 1,
      codec_type: 'audio',
      codec_name: 'aac',
      sample_rate: '44100',
      channels: 1,
      avg_frame_rate: '0/0',
      r_frame_rate: '0/0'
    }
  ],
  format: { duration: '1.000000' }
}

describe('parseProbeOutput', () => {
  it('reads duration, video size, frame rate, codec and audio streams', () => {
    expect(parseProbeOutput(sampleFfprobe)).toEqual({
      durationSec: 1,
      video: { width: 320, height: 240, fps: 25, codec: 'h264', rotation: 0 },
      audio: [{ index: 1, codec: 'aac', channels: 1, sampleRate: 44100 }]
    })
  })

  it('reads an NTSC fraction such as 30000/1001 as a real frame rate', () => {
    const json = structuredClone(sampleFfprobe)
    json.streams[0].avg_frame_rate = '30000/1001'
    expect(parseProbeOutput(json).video?.fps).toBeCloseTo(29.97, 2)
  })

  it('falls back to r_frame_rate, then null, when the average is unknown', () => {
    const json = structuredClone(sampleFfprobe)
    json.streams[0].avg_frame_rate = '0/0'
    expect(parseProbeOutput(json).video?.fps).toBe(25)
    json.streams[0].r_frame_rate = '0/0'
    expect(parseProbeOutput(json).video?.fps).toBeNull()
  })

  it.each([
    [
      'a display matrix of -90 degrees (phone portrait)',
      { side_data_list: [{ rotation: -90 }] },
      270
    ],
    ['a display matrix of 90 degrees', { side_data_list: [{ rotation: 90 }] }, 90],
    ['an old rotate tag of 180', { tags: { rotate: '180' } }, 180],
    ['no rotation data', {}, 0]
  ])('reads rotation from %s', (_label, extra, expected) => {
    const json = structuredClone(sampleFfprobe)
    Object.assign(json.streams[0], extra)
    expect(parseProbeOutput(json).video?.rotation).toBe(expected)
  })

  it('reports audio-only files with no video', () => {
    const json = { streams: [sampleFfprobe.streams[1]], format: { duration: '2.5' } }
    expect(parseProbeOutput(json)).toEqual({
      durationSec: 2.5,
      video: null,
      audio: [{ index: 1, codec: 'aac', channels: 1, sampleRate: 44100 }]
    })
  })

  it.each([
    ['no streams at all', { streams: [], format: { duration: '1' } }],
    ['a zero duration', { ...sampleFfprobe, format: { duration: '0.000000' } }],
    ['a missing duration', { streams: sampleFfprobe.streams, format: {} }],
    [
      'a video stream with no size',
      { ...sampleFfprobe, streams: [{ index: 0, codec_type: 'video' }] }
    ],
    ['output that is not an ffprobe report', { hello: 'world' }]
  ])('rejects %s with a plain UserFacingError', (_label, json) => {
    expect(() => parseProbeOutput(json)).toThrow(UserFacingError)
  })
})

// The real binary runs only where resources/bin holds ffprobe (run `pnpm fetch:bin` first). CI
// without FFmpeg skips it; the parser tests above still run.
const appLocation: BinaryLocation = { isPackaged: false, appPath: process.cwd(), resourcesPath: '' }
const ffprobe = findFfprobe()

function findFfprobe(): string | undefined {
  try {
    return resolveBinary('ffprobe', appLocation)
  } catch {
    return undefined
  }
}

describe.skipIf(!ffprobe)('probeMedia on the sample file', () => {
  const sample = resolve(process.cwd(), 'tests/fixtures/media/sample.mp4')

  it('reads the real streams of the fixture file', async () => {
    const result = await probeMedia(sample, { ffprobe: ffprobe as string })
    expect(result.durationSec).toBeCloseTo(1, 1)
    expect(result.video).toEqual({ width: 320, height: 240, fps: 25, codec: 'h264', rotation: 0 })
    expect(result.audio).toEqual([expect.objectContaining({ codec: 'aac', channels: 1 })])
  })

  it('reports a plain error for a file that is not media', async () => {
    const notMedia = resolve(process.cwd(), 'package.json')
    await expect(probeMedia(notMedia, { ffprobe: ffprobe as string })).rejects.toBeInstanceOf(
      UserFacingError
    )
  })

  it('stops the child process when the signal aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      probeMedia(sample, { ffprobe: ffprobe as string, signal: controller.signal })
    ).rejects.toThrow()
  })
})
