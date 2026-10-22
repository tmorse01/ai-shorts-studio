import { describe, expect, it } from 'vitest'
import {
  buildAss,
  cropRect,
  dedupeCandidates,
  formatAssTime,
  normalizeSegments,
  outputSize,
  remapCaptions,
  validateShortDuration
} from '../src/shared/timeline'

describe('normalizeSegments', () => {
  it('clamps to the source duration and drops slivers', () => {
    const out = normalizeSegments(
      [
        { startSec: -5, endSec: 10 },
        { startSec: 50, endSec: 120 },
        { startSec: 60, endSec: 60.2 }
      ],
      100
    )
    expect(out).toEqual([
      { startSec: 0, endSec: 10 },
      { startSec: 50, endSec: 100 }
    ])
  })

  it('sorts and merges overlapping segments without mutating input', () => {
    const input = [
      { startSec: 20, endSec: 30 },
      { startSec: 5, endSec: 12 },
      { startSec: 10, endSec: 15 }
    ]
    const out = normalizeSegments(input, 100)
    expect(out).toEqual([{ startSec: 5, endSec: 15 }, { startSec: 20, endSec: 30 }])
    expect(input[0]).toEqual({ startSec: 20, endSec: 30 })
  })
})

describe('validateShortDuration', () => {
  it('accepts a multi-cut short inside the length window', () => {
    expect(
      validateShortDuration([
        { startSec: 0, endSec: 15 },
        { startSec: 40, endSec: 55 }
      ])
    ).toBeNull()
  })

  it('rejects shorts that are too short, too long, or have too many cuts', () => {
    expect(validateShortDuration([{ startSec: 0, endSec: 5 }])).toMatch(/at least/)
    expect(validateShortDuration([{ startSec: 0, endSec: 100 }])).toMatch(/at most/)
    const many = Array.from({ length: 7 }, (_, i) => ({ startSec: i * 10, endSec: i * 10 + 2 }))
    expect(validateShortDuration(many)).toMatch(/segments/)
    expect(validateShortDuration([])).toMatch(/at least one/)
  })
})

describe('dedupeCandidates', () => {
  it('keeps the higher-ranked of two heavily overlapping windows', () => {
    const out = dedupeCandidates([
      { rank: 1, startSec: 0, endSec: 40 },
      { rank: 2, startSec: 5, endSec: 45 },
      { rank: 3, startSec: 100, endSec: 140 }
    ])
    expect(out.map((c) => c.rank)).toEqual([1, 3])
  })
})

describe('outputSize and cropRect', () => {
  it('uses fixed sizes for vertical, square and landscape ratios', () => {
    expect(outputSize('9:16', { width: 3840, height: 2160 })).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('1:1', { width: 1920, height: 1080 })).toEqual({ width: 1080, height: 1080 })
  })

  it('keeps original dimensions rounded to even numbers', () => {
    expect(outputSize('original', { width: 1921, height: 1081 })).toEqual({ width: 1920, height: 1080 })
  })

  it('crops a centred 9:16 window from 16:9 footage', () => {
    const rect = cropRect({ width: 1920, height: 1080 }, '9:16', { x: 0.5, y: 0.5, mode: 'crop' })
    expect(rect).toEqual({ x: 656, y: 0, width: 608, height: 1080 })
  })

  it('moves the crop window to the framing edges', () => {
    const left = cropRect({ width: 1920, height: 1080 }, '9:16', { x: 0, y: 0, mode: 'crop' })
    const right = cropRect({ width: 1920, height: 1080 }, '9:16', { x: 1, y: 0, mode: 'crop' })
    expect(left?.x).toBe(0)
    expect(right?.x).toBe(1920 - 608)
  })

  it('returns null for fit mode and original ratio', () => {
    expect(cropRect({ width: 1920, height: 1080 }, '9:16', { x: 0.5, y: 0.5, mode: 'fit' })).toBeNull()
    expect(cropRect({ width: 1920, height: 1080 }, 'original', { x: 0.5, y: 0.5, mode: 'crop' })).toBeNull()
  })
})

describe('remapCaptions', () => {
  it('maps source times onto the concatenated output timeline and clips cut edges', () => {
    const out = remapCaptions(
      [
        { startSec: 12, endSec: 14, text: 'a' },
        { startSec: 19, endSec: 23, text: 'straddles' },
        { startSec: 30, endSec: 31, text: 'outside' }
      ],
      [
        { startSec: 10, endSec: 20 },
        { startSec: 40, endSec: 50 }
      ]
    )
    expect(out).toEqual([
      { startSec: 2, endSec: 4, text: 'a' },
      { startSec: 9, endSec: 10, text: 'straddles' }
    ])
  })
})

describe('ASS captions', () => {
  it('formats times as h:mm:ss.cc', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00')
    expect(formatAssTime(3661.5)).toBe('1:01:01.50')
  })

  it('escapes override braces and emits dialogue lines', () => {
    const ass = buildAss(
      [{ startSec: 1, endSec: 2.5, text: 'hi {evil} \\ there' }],
      { width: 1080, height: 1920 },
      { fontSize: 72, marginV: 300 }
    )
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,hi evil \\\\ there')
    expect(ass).not.toContain('{evil}')
  })
})
