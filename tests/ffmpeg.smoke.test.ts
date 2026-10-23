import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EXPORT_OPTIONS } from '../src/shared/export-math'

// Electron's `app` is only needed to locate bundled binaries; point it at the repo instead.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(process.cwd()) }
}))

const { buildExportArgs, probeMedia, runProcess, binPath } = await import('../src/main/ffmpeg')

const { buildAss } = await import('../src/shared/timeline')
const { buildProxyArgs } = await import('../src/main/jobs')
const { PLAYABLE_VIDEO_CODECS } = await import('../src/shared/types')

const workRoot = mkdtempSync(join(tmpdir(), 'shorts-smoke-'))
const fixtures = join(workRoot, 'fixtures')

function makeFixture(name: string, withAudio: boolean): string {
  const out = join(fixtures, name)
  const args = ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=40']
  if (withAudio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=40')
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast')
  if (withAudio) args.push('-c:a', 'aac', '-shortest')
  args.push(out)
  execFileSync(binPath('ffmpeg'), args, { stdio: 'pipe' })
  return out
}

function ffprobeJson(path: string): {
  streams: { codec_type: string; width?: number; height?: number }[]
  format: { duration: string }
} {
  return JSON.parse(
    execFileSync(binPath('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path], {
      encoding: 'utf8'
    })
  )
}

let withAudioSrc: string
let noAudioSrc: string
let musicSrc: string

beforeAll(() => {
  mkdirSync(fixtures, { recursive: true })
  withAudioSrc = makeFixture('with-audio.mp4', true)
  noAudioSrc = makeFixture('no-audio.mp4', false)
  musicSrc = join(fixtures, 'music.wav')
  execFileSync(
    binPath('ffmpeg'),
    ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=20', musicSrc],
    { stdio: 'pipe' }
  )
})

afterAll(() => {
  rmSync(workRoot, { recursive: true, force: true })
})

describe('real FFmpeg export', () => {
  it('probes real streams, including a source without audio', async () => {
    const withAudio = await probeMedia(withAudioSrc)
    expect(withAudio).toMatchObject({ width: 1280, height: 720, hasAudio: true })
    expect(withAudio.durationSec).toBeCloseTo(40, 0)

    const noAudio = await probeMedia(noAudioSrc)
    expect(noAudio.hasAudio).toBe(false)
  })

  it('exports a multi-cut 9:16 short with captions and music, verified by ffprobe', async () => {
    const probe = await probeMedia(withAudioSrc)
    const outDir = join(workRoot, 'out-multicut')
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, 'clip.mp4')
    const captions = [{ startSec: 2, endSec: 5, text: 'first cut hook' }]
    const plan = buildExportArgs(
      {
        sourcePath: withAudioSrc,
        probe,
        segments: [
          { startSec: 3, endSec: 13, atSec: 0 },
          { startSec: 25, endSec: 40, atSec: 15 }
        ],
        lengthSec: 30,
        captions,
        ratio: '9:16',
        framing: { x: 0.5, y: 0.5, mode: 'crop' },
        captionsEnabled: true,
        captionFontSize: 72,
        music: [{ path: musicSrc, startSec: 0, trackStartSec: 0, lengthSec: 20 }],
        musicVolume: 0.3,
        musicDuck: true,
        narrationPath: null,
        options: DEFAULT_EXPORT_OPTIONS
      },
      outPath
    )
    // The 5 s of blank between the cuts counts toward the short's length, and is filled in the export.
    expect(plan.totalSec).toBeCloseTo(30, 3)
    const cwd = join(workRoot, 'work-multicut')
    mkdirSync(cwd, { recursive: true })
    if (plan.captions.length > 0) {
      writeFileSync(join(cwd, 'captions.ass'), buildAss(plan.captions, plan.outputSize, { fontSize: 72, marginV: 300 }))
    }
    await runProcess(binPath('ffmpeg'), plan.args, { cwd })

    expect(existsSync(outPath)).toBe(true)
    const info = ffprobeJson(outPath)
    const video = info.streams.find((s) => s.codec_type === 'video')
    const audio = info.streams.find((s) => s.codec_type === 'audio')
    expect(video).toMatchObject({ width: 1080, height: 1920 })
    expect(audio).toBeDefined()
    expect(Number(info.format.duration)).toBeGreaterThan(29.5)
    expect(Number(info.format.duration)).toBeLessThan(30.5)
  })

  it('detects an HEVC source and makes a playable 720p H.264 preview proxy', async () => {
    const hevc = join(fixtures, 'hevc.mov')
    execFileSync(
      binPath('ffmpeg'),
      ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=6', '-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', hevc],
      { stdio: 'pipe' }
    )
    const probe = await probeMedia(hevc)
    expect(probe.videoCodec).toBe('hevc')
    expect(PLAYABLE_VIDEO_CODECS.has(probe.videoCodec)).toBe(false)

    const proxy = join(workRoot, 'proxy.mp4')
    await runProcess(binPath('ffmpeg'), buildProxyArgs(hevc, proxy))
    const info = ffprobeJson(proxy)
    const v = info.streams.find((s) => s.codec_type === 'video') as { codec_name?: string; height?: number }
    expect(v.codec_name).toBe('h264')
    expect(v.height).toBe(720)
    expect(info.streams.some((s) => s.codec_type === 'audio')).toBe(false)
  })

  it('exports from footage with no audio track, producing a valid audio stream', async () => {
    const probe = await probeMedia(noAudioSrc)
    const outPath = join(workRoot, 'out-noaudio.mp4')
    const plan = buildExportArgs(
      {
        sourcePath: noAudioSrc,
        probe,
        segments: [{ startSec: 5, endSec: 20, atSec: 0 }],
        lengthSec: 15,
        captions: [],
        ratio: '1:1',
        framing: { x: 0.5, y: 0.5, mode: 'fit' },
        captionsEnabled: false,
        captionFontSize: 72,
        music: [],
        musicVolume: 0.3,
        musicDuck: false,
        narrationPath: null,
        options: DEFAULT_EXPORT_OPTIONS
      },
      outPath
    )
    const cwd = join(workRoot, 'work-noaudio')
    mkdirSync(cwd, { recursive: true })
    await runProcess(binPath('ffmpeg'), plan.args, { cwd })

    const info = ffprobeJson(outPath)
    expect(info.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1080, height: 1080 })
    expect(info.streams.some((s) => s.codec_type === 'audio')).toBe(true)
    expect(Number(info.format.duration)).toBeCloseTo(15, 0)
  })

  it('applies 720p, 30 fps and the audio bitrate option to the rendered file', async () => {
    const probe = await probeMedia(withAudioSrc)
    const outPath = join(workRoot, 'out-options.mp4')
    const plan = buildExportArgs(
      {
        sourcePath: withAudioSrc,
        probe,
        segments: [{ startSec: 2, endSec: 8, atSec: 0 }],
        lengthSec: 6,
        captions: [],
        ratio: '9:16',
        framing: { x: 0.5, y: 0.5, mode: 'crop' },
        captionsEnabled: false,
        captionFontSize: 72,
        music: [],
        musicVolume: 0.3,
        musicDuck: false,
        narrationPath: null,
        options: { quality: 'high', resolution: '720p', fps: 30, audioKbps: 192 }
      },
      outPath
    )
    const cwd = join(workRoot, 'work-options')
    mkdirSync(cwd, { recursive: true })
    await runProcess(binPath('ffmpeg'), plan.args, { cwd })

    const info = ffprobeJson(outPath)
    expect(info.streams.find((s) => s.codec_type === 'video')).toMatchObject({
      width: 720,
      height: 1280,
      r_frame_rate: '30/1'
    })
    // AAC rate control lands below its target on short clips, so assert the requested rate, not the measured one.
    expect(plan.args).toEqual(expect.arrayContaining(['-b:a', '192k']))
    expect(info.streams.some((s) => s.codec_type === 'audio')).toBe(true)
  })
})
