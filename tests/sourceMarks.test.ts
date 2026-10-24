import { describe, expect, it } from 'vitest'
import { markIn, markOut, markedRange, NO_MARKS, rangePercent } from '@shared/media/sourceMarks'

describe('source marks', () => {
  it('sets In and Out inside the clip and clamps them to its length', () => {
    expect(markIn(NO_MARKS, 1500, 10_000)).toEqual({ inMs: 1500, outMs: null })
    expect(markOut({ inMs: 1500, outMs: null }, 20_000, 10_000)).toEqual({
      inMs: 1500,
      outMs: 10_000
    })
    expect(markIn(NO_MARKS, -40, 10_000)).toEqual({ inMs: 0, outMs: null })
  })

  it('removes the other mark when a new one would make the range reversed or empty', () => {
    expect(markIn({ inMs: null, outMs: 2000 }, 3000, 10_000)).toEqual({
      inMs: 3000,
      outMs: null
    })
    expect(markOut({ inMs: 3000, outMs: null }, 1000, 10_000)).toEqual({
      inMs: null,
      outMs: 1000
    })
    expect(markOut({ inMs: 3000, outMs: null }, 3000, 10_000)).toEqual({
      inMs: null,
      outMs: 3000
    })
  })

  it('keeps a valid range when a mark moves inside it', () => {
    expect(markIn({ inMs: 1000, outMs: 5000 }, 2000, 10_000)).toEqual({
      inMs: 2000,
      outMs: 5000
    })
  })

  it('reports the range only when both marks are set', () => {
    expect(markedRange({ inMs: 1000, outMs: null })).toBeNull()
    expect(markedRange({ inMs: 1000, outMs: 4000 })).toEqual({ startMs: 1000, endMs: 4000 })
  })

  it('places a range as percentages of the duration', () => {
    expect(rangePercent({ startMs: 2500, endMs: 7500 }, 10_000)).toEqual({ left: 25, width: 50 })
    expect(rangePercent({ startMs: 0, endMs: 10_000 }, 0)).toEqual({ left: 0, width: 0 })
  })
})
