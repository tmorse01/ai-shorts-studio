import { describe, expect, it } from 'vitest'
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  clampPixelsPerSecond,
  outputToSource,
  rulerStep,
  sourceToOutput
} from '../src/shared/timeline-math'

// Cuts placed on the timeline with a blank stretch between them: 0–10 s is cut one, 10–15 s is blank,
// and cut two plays from 15 s to 20 s on the timeline.
const cuts = [
  { startSec: 10, endSec: 20, atSec: 0 },
  { startSec: 50, endSec: 55, atSec: 15 }
]

describe('timeline and source time', () => {
  it('maps source moments onto the timeline and back', () => {
    expect(sourceToOutput(cuts, 12)).toBe(2)
    expect(sourceToOutput(cuts, 52)).toBe(17)
    expect(sourceToOutput(cuts, 30)).toBeNull()
    expect(outputToSource(cuts, 2)).toBe(12)
    expect(outputToSource(cuts, 17)).toBe(52)
  })

  it('reports blank timeline time as no source at all', () => {
    expect(outputToSource(cuts, 12)).toBeNull()
    expect(outputToSource([], 3)).toBeNull()
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
