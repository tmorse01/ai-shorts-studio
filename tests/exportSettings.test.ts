import { describe, expect, it } from 'vitest'
import {
  chooseEncoder,
  DEFAULT_EXPORT_SETTINGS,
  estimateExport,
  exportFileName,
  exportPreset,
  exportSettingsSchema,
  formatBytes,
  formatEncodeTime,
  parseEncoderNames,
  parseFfmpegVersion,
  renderExportName,
  supportsAmixNormalize
} from '@shared/export/exportSettings'

const ENCODERS_OUTPUT = `Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC (codec h264)
 V....D libx265              libx265 H.265 / HEVC (codec hevc)
 A....D aac                  AAC (Advanced Audio Coding)
`

describe('export presets and settings', () => {
  it('starts from the first preset with the default settings', () => {
    expect(DEFAULT_EXPORT_SETTINGS.presetId).toBe('youtube')
    expect(exportSettingsSchema.parse(DEFAULT_EXPORT_SETTINGS)).toEqual(DEFAULT_EXPORT_SETTINGS)
    expect(exportPreset('tiktok').label).toBe('TikTok')
  })

  it('rejects a frame rate outside the offered list and an empty template', () => {
    expect(exportSettingsSchema.safeParse({ ...DEFAULT_EXPORT_SETTINGS, fps: 29 }).success).toBe(
      false
    )
    expect(
      exportSettingsSchema.safeParse({ ...DEFAULT_EXPORT_SETTINGS, namingTemplate: '  ' }).success
    ).toBe(false)
  })
})

describe('renderExportName', () => {
  const values = { project: 'Trip', short: 'Best bit', index: 3, preset: 'TikTok' }

  it('fills the placeholders and adds the extension suffix', () => {
    const name = renderExportName('{project} - {index} {short} {preset}', values)
    expect(name).toBe('Trip - 3 Best bit TikTok')
    expect(exportFileName(name)).toBe('Trip - 3 Best bit TikTok.mp4')
  })

  it('drops characters Windows does not allow and falls back when nothing is left', () => {
    expect(renderExportName('a:b/c?*', values)).toBe('abc')
    expect(renderExportName('???', values)).toBe('export')
  })
})

describe('encoder choice and detection parsing', () => {
  it('prefers a hardware encoder and falls back to x264', () => {
    expect(chooseEncoder(['libx264', 'h264_qsv', 'h264_nvenc'])).toEqual({
      encoder: 'h264_nvenc',
      hardware: true,
      fallback: false
    })
    expect(chooseEncoder(['libx264'])).toEqual({
      encoder: 'libx264',
      hardware: false,
      fallback: true
    })
    expect(chooseEncoder([])).toEqual({ encoder: 'libx264', hardware: false, fallback: true })
  })

  it('lists only the H.264 encoders from ffmpeg -encoders', () => {
    expect(parseEncoderNames(ENCODERS_OUTPUT)).toEqual(['h264_nvenc', 'libx264'])
  })

  it('reads the release version and rejects builds older than 5.0 for amix', () => {
    const modern = parseFfmpegVersion('ffmpeg version 6.1.1-essentials_build-www.gyan.dev\n')
    expect(modern?.text).toBe('6.1.1')
    expect(supportsAmixNormalize(modern)).toBe(true)

    const old = parseFfmpegVersion('ffmpeg version n4.4.1 Copyright')
    expect(old?.text).toBe('4.4.1')
    expect(supportsAmixNormalize(old)).toBe(false)

    const git = parseFfmpegVersion('ffmpeg version N-112345-gabcdef')
    expect(git).toBeNull()
    expect(supportsAmixNormalize(git)).toBe(false)
  })
})

describe('estimateExport', () => {
  it('sizes the file from the preset bitrates and the length', () => {
    const preset = exportPreset('youtube')
    // 10 s at 10192 kbps (video plus audio) is about 12.7 MB. Encode time is 0.4x realtime on hardware.
    const hardware = estimateExport(10_000, preset, true)
    expect(hardware.bytes).toBe(Math.round((10192 * 1000 * 10) / 8))
    expect(hardware.seconds).toBe(4)
    expect(estimateExport(10_000, preset, false).seconds).toBe(15)
  })

  it('formats sizes and times for display', () => {
    expect(formatBytes(12_740_000)).toBe('12 MB')
    expect(formatEncodeTime(4)).toBe('4 s')
    expect(formatEncodeTime(150)).toBe('3 min')
  })
})
