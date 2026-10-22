import { describe, expect, it } from 'vitest'
import {
  bufferedEnd,
  clampTime,
  fractionAtTime,
  frameStepSec,
  pointerFraction,
  skipTarget,
  spanPercent,
  timeAtFraction,
  timecode
} from '../src/renderer/player/player-math'

describe('clampTime', () => {
  it('keeps times inside the duration', () => {
    expect(clampTime(-2, 30)).toBe(0)
    expect(clampTime(12, 30)).toBe(12)
    expect(clampTime(99, 30)).toBe(30)
  })

  it('only applies the floor while the duration is unknown', () => {
    expect(clampTime(99, 0)).toBe(99)
    expect(clampTime(NaN, 0)).toBe(0)
  })
})

describe('scrub maths', () => {
  it('maps a bar fraction to a time and back', () => {
    expect(timeAtFraction(0.25, 40)).toBe(10)
    expect(fractionAtTime(10, 40)).toBe(0.25)
  })

  it('clamps pointer positions outside the bar', () => {
    const bar = { left: 100, width: 200 }
    expect(pointerFraction(50, bar)).toBe(0)
    expect(pointerFraction(150, bar)).toBe(0.25)
    expect(pointerFraction(999, bar)).toBe(1)
  })

  it('returns zero for an empty bar or an unknown duration', () => {
    expect(pointerFraction(10, { left: 0, width: 0 })).toBe(0)
    expect(timeAtFraction(0.5, 0)).toBe(0)
    expect(fractionAtTime(5, 0)).toBe(0)
  })
})

describe('skipTarget and frame steps', () => {
  it('skips relative to the current time and stays in range', () => {
    expect(skipTarget(3, -5, 60)).toBe(0)
    expect(skipTarget(58, 5, 60)).toBe(60)
    expect(skipTarget(10, 5, 60)).toBe(15)
  })

  it('steps one frame at 30fps by default', () => {
    expect(frameStepSec()).toBeCloseTo(1 / 30, 10)
    expect(frameStepSec(60)).toBeCloseTo(1 / 60, 10)
  })
})

describe('bufferedEnd', () => {
  const ranges = [
    { startSec: 0, endSec: 4 },
    { startSec: 6, endSec: 10 }
  ]

  it('returns the end of the range that holds the time', () => {
    expect(bufferedEnd(ranges, 2)).toBe(4)
    expect(bufferedEnd(ranges, 8)).toBe(10)
  })

  it('returns the time itself when nothing is buffered there', () => {
    expect(bufferedEnd(ranges, 5)).toBe(5)
    expect(bufferedEnd([], 1)).toBe(1)
  })
})

describe('spanPercent', () => {
  it('places a span as left and width percentages', () => {
    expect(spanPercent({ startSec: 10, endSec: 20 }, 100)).toEqual({ left: '10%', width: '10%' })
  })

  it('returns an empty box when the duration is unknown', () => {
    expect(spanPercent({ startSec: 1, endSec: 2 }, 0)).toEqual({ left: '0%', width: '0%' })
  })
})

describe('timecode', () => {
  it('formats minutes and seconds', () => {
    expect(timecode(0)).toBe('0:00')
    expect(timecode(65.9)).toBe('1:05')
  })

  it('adds hours past one hour', () => {
    expect(timecode(3725)).toBe('1:02:05')
  })

  it('treats negative and non-finite input as zero', () => {
    expect(timecode(-4)).toBe('0:00')
    expect(timecode(Infinity)).toBe('0:00')
  })
})
