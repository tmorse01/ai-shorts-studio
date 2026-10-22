import { describe, expect, it } from 'vitest'
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  clampPixelsPerSecond,
  moveSegment,
  outputStarts,
  outputToSource,
  rulerStep,
  sourceToOutput,
  totalOutputSec,
  trimEnd,
  trimStart
} from '../src/shared/timeline-math'

const cuts = [
  { startSec: 10, endSec: 20 },
  { startSec: 50, endSec: 55 }
]

describe('output and source time', () => {
  it('lays cuts end to end in output time', () => {
    expect(totalOutputSec(cuts)).toBe(15)
    expect(outputStarts(cuts)).toEqual([0, 10])
  })

  it('maps source moments to output and back', () => {
    expect(sourceToOutput(cuts, 12)).toBe(2)
    expect(sourceToOutput(cuts, 52)).toBe(12)
    expect(sourceToOutput(cuts, 30)).toBeNull()
    expect(outputToSource(cuts, 2)).toBe(12)
    expect(outputToSource(cuts, 12)).toBe(52)
  })

  it('clamps output times past the end to the last cut', () => {
    expect(outputToSource(cuts, 999)).toBe(55)
    expect(outputToSource([], 3)).toBe(0)
  })
})

describe('drag rules', () => {
  it('trims the start but never past the end or the minimum length', () => {
    expect(trimStart({ startSec: 10, endSec: 20 }, 3)).toEqual({ startSec: 13, endSec: 20 })
    expect(trimStart({ startSec: 10, endSec: 20 }, 50)).toEqual({ startSec: 19.5, endSec: 20 })
    expect(trimStart({ startSec: 1, endSec: 20 }, -50)).toEqual({ startSec: 0, endSec: 20 })
  })

  it('trims the end but never past the source or the minimum length', () => {
    expect(trimEnd({ startSec: 10, endSec: 20 }, -3, 100)).toEqual({ startSec: 10, endSec: 17 })
    expect(trimEnd({ startSec: 10, endSec: 20 }, -50, 100)).toEqual({ startSec: 10, endSec: 10.5 })
    expect(trimEnd({ startSec: 10, endSec: 20 }, 500, 100)).toEqual({ startSec: 10, endSec: 100 })
  })

  it('slides a cut without changing its length, staying inside the source', () => {
    expect(moveSegment({ startSec: 10, endSec: 20 }, 5, 100)).toEqual({ startSec: 15, endSec: 25 })
    expect(moveSegment({ startSec: 10, endSec: 20 }, 500, 100)).toEqual({ startSec: 90, endSec: 100 })
    expect(moveSegment({ startSec: 10, endSec: 20 }, -500, 100)).toEqual({ startSec: 0, endSec: 10 })
  })
})

describe('zoom and ruler', () => {
  it('keeps zoom within the allowed range', () => {
    expect(clampPixelsPerSecond(0)).toBe(MIN_PIXELS_PER_SECOND)
    expect(clampPixelsPerSecond(1000)).toBe(MAX_PIXELS_PER_SECOND)
    expect(clampPixelsPerSecond(16)).toBe(16)
  })

  it('picks the smallest ruler step that keeps ticks at least 70px apart', () => {
    expect(rulerStep(16)).toBe(5)
    expect(rulerStep(80)).toBe(1)
    expect(rulerStep(4)).toBe(30)
  })
})
