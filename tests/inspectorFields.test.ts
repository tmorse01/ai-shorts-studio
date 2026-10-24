import { describe, expect, it } from 'vitest'
import {
  clamp,
  displayValue,
  dragMultiplier,
  formatDb,
  formatFieldTimecode,
  MIXED_VALUE,
  parseDb,
  parseFieldTimecode,
  scrubValue
} from '@renderer/ui/fieldMath'

const NONE = { shift: false, ctrl: false }

describe('scrub drag', () => {
  it('scales by one step per pixel, with Shift finer and Ctrl coarser', () => {
    expect(dragMultiplier(NONE)).toBe(1)
    expect(dragMultiplier({ shift: true, ctrl: false })).toBe(0.1)
    expect(dragMultiplier({ shift: false, ctrl: true })).toBe(10)
    expect(scrubValue(10, 5, 1, NONE)).toBe(15)
    expect(scrubValue(10, 50, 1, { shift: true, ctrl: false })).toBe(15)
    expect(scrubValue(10, 2, 1, { shift: false, ctrl: true })).toBe(30)
  })

  it('snaps to the step and moves backwards for a leftward drag', () => {
    expect(scrubValue(0, 3, 0.5, NONE)).toBe(1.5)
    expect(scrubValue(10, -4, 1, NONE)).toBe(6)
  })
})

describe('timecode field (mm:ss.ff)', () => {
  it('parses a valid time to milliseconds at 30 frames a second', () => {
    expect(parseFieldTimecode('00:00.00')).toBe(0)
    expect(parseFieldTimecode('01:02.15')).toBe(62_000 + 500)
    expect(parseFieldTimecode(' 00:01.00 ')).toBe(1000)
  })

  it('rejects text that is not mm:ss.ff, or a frame past 29', () => {
    expect(parseFieldTimecode('1:2')).toBeNull()
    expect(parseFieldTimecode('00:60.00')).toBeNull()
    expect(parseFieldTimecode('00:01.30')).toBeNull()
    expect(parseFieldTimecode('abc')).toBeNull()
  })

  it('formats milliseconds back to mm:ss.ff and round-trips', () => {
    expect(formatFieldTimecode(0)).toBe('00:00.00')
    expect(formatFieldTimecode(61_000)).toBe('01:01.00')
    expect(formatFieldTimecode(62_500)).toBe('01:02.15')
    expect(parseFieldTimecode('01:02.15')).toBe(62_500)
  })
})

describe('dB field', () => {
  it('parses plain numbers and dB-suffixed numbers', () => {
    expect(parseDb('-6')).toBe(-6)
    expect(parseDb('-6.5 dB')).toBe(-6.5)
    expect(parseDb('+3')).toBe(3)
    expect(parseDb('loud')).toBeNull()
  })

  it('formats with one decimal place and the dB unit', () => {
    expect(formatDb(-6)).toBe('-6.0 dB')
  })
})

describe('mixed values and clamping', () => {
  it('shows the value when all selected items match and an em dash when they differ', () => {
    expect(displayValue([5, 5, 5], String)).toBe('5')
    expect(displayValue([5, 6], String)).toBe(MIXED_VALUE)
    expect(displayValue([], String)).toBe('')
  })

  it('clamps a value into its range', () => {
    expect(clamp(150, 0, 100)).toBe(100)
    expect(clamp(-3, 0, 100)).toBe(0)
    expect(clamp(42, 0, 100)).toBe(42)
  })
})
