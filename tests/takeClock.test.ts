import { describe, expect, it } from 'vitest'
import {
  micErrorMessage,
  narrationTakeClip,
  takeDurationMs,
  takeStartMs
} from '@shared/narration/take'
import { encodeWav, frameCount } from '@shared/narration/wav'
import { IDENTITY_TRANSFORM } from '@shared/timeline/timeline'

describe('take clock alignment', () => {
  it('starts the clip at the playhead the take began from, in whole ms', () => {
    expect(takeStartMs(1234.6)).toBe(1235)
    expect(takeStartMs(0)).toBe(0)
  })

  it('never starts a clip before the timeline', () => {
    expect(takeStartMs(-20)).toBe(0)
  })

  it('measures the take from its sample count and rate', () => {
    expect(takeDurationMs(48000, 48000)).toBe(1000)
    expect(takeDurationMs(24000, 48000)).toBe(500)
    expect(takeDurationMs(0, 48000)).toBe(0)
    expect(takeDurationMs(100, 0)).toBe(0)
  })

  it('builds a recorded narration clip that plays from the start of its file', () => {
    const clip = narrationTakeClip({
      clipId: 'c1',
      mediaId: 'm1',
      startMs: 4000.4,
      durationMs: 2500.2
    })
    expect(clip).toEqual({
      id: 'c1',
      mediaId: 'm1',
      startMs: 4000,
      durationMs: 2500,
      sourceInMs: 0,
      transform: IDENTITY_TRANSFORM,
      narration: { source: 'recorded' }
    })
  })

  it('keeps a clip at least 1 ms long', () => {
    expect(
      narrationTakeClip({ clipId: 'c', mediaId: 'm', startMs: 0, durationMs: 0 }).durationMs
    ).toBe(1)
  })

  it('gives a plain-language message for each microphone failure', () => {
    expect(micErrorMessage('NotAllowedError')).toContain('Microphone access is blocked')
    expect(micErrorMessage('NotFoundError')).toContain('No microphone was found')
    expect(micErrorMessage('NotReadableError')).toContain('in use by another app')
    expect(micErrorMessage(undefined)).toBe('The microphone could not be started.')
  })
})

describe('WAV encoding of a take', () => {
  it('writes a 16-bit mono PCM header with the sample rate and data size', () => {
    const channel = new Float32Array([0, 0.5, -0.5, 1])
    const bytes = encodeWav([channel], 48000)
    const view = new DataView(bytes.buffer)
    const text = (offset: number, length: number) =>
      String.fromCharCode(...bytes.slice(offset, offset + length))

    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(text(12, 4)).toBe('fmt ')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(8)
    expect(bytes.byteLength).toBe(44 + 8)
    expect(view.getUint32(4, true)).toBe(36 + 8)
  })

  it('writes the samples as clamped 16-bit values', () => {
    const bytes = encodeWav([new Float32Array([0.5, -2, 2])], 16000)
    const view = new DataView(bytes.buffer)
    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff))
    expect(view.getInt16(46, true)).toBe(-0x8000)
    expect(view.getInt16(48, true)).toBe(0x7fff)
  })

  it('mixes several channels down to one', () => {
    const bytes = encodeWav([new Float32Array([1]), new Float32Array([0])], 48000)
    expect(new DataView(bytes.buffer).getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff))
  })

  it('counts frames from the longest channel', () => {
    expect(frameCount([new Float32Array(10), new Float32Array(12)])).toBe(12)
    expect(frameCount([])).toBe(0)
  })
})
