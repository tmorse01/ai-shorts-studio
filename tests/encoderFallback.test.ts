import { describe, expect, it } from 'vitest'
import { fallbackEncoder } from '@shared/export/encoderFallback'

const failure = { cancelled: false, details: 'Cannot load nvcuda.dll' }

describe('fallbackEncoder', () => {
  it('retries a failed hardware encoder with libx264', () => {
    expect(fallbackEncoder('h264_nvenc', failure)).toBe('libx264')
    expect(fallbackEncoder('h264_qsv', failure)).toBe('libx264')
    expect(fallbackEncoder('h264_amf', failure)).toBe('libx264')
  })

  it('does not retry a cancelled export', () => {
    expect(fallbackEncoder('h264_nvenc', { cancelled: true })).toBeNull()
  })

  it('does not retry x264, which is already the fallback', () => {
    expect(fallbackEncoder('libx264', failure)).toBeNull()
  })

  it('does not retry an encoder that is not one of the hardware encoders', () => {
    expect(fallbackEncoder('h264_videotoolbox', failure)).toBeNull()
  })
})
