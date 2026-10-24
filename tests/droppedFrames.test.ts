import { describe, expect, it } from 'vitest'
import {
  FRAME_INTERVAL_MS,
  NO_DROPPED_FRAMES,
  recordFrameDraw
} from '../src/renderer/features/compositor/droppedFrames'

describe('recordFrameDraw', () => {
  it('counts nothing for drawn frames or while paused', () => {
    expect(recordFrameDraw(NO_DROPPED_FRAMES, { nowMs: 0, playing: true, drawn: true })).toEqual(
      NO_DROPPED_FRAMES
    )
    expect(recordFrameDraw(NO_DROPPED_FRAMES, { nowMs: 0, playing: false, drawn: false })).toEqual(
      NO_DROPPED_FRAMES
    )
  })

  it('counts a held frame while playing', () => {
    const state = recordFrameDraw(NO_DROPPED_FRAMES, { nowMs: 100, playing: true, drawn: false })
    expect(state.dropped).toBe(1)
  })

  it('counts at most one dropped frame per frame interval', () => {
    let state = recordFrameDraw(NO_DROPPED_FRAMES, { nowMs: 0, playing: true, drawn: false })
    // Holds at 60Hz tick rate within one frame interval count once.
    for (let tick = 1; tick * 16 < FRAME_INTERVAL_MS; tick += 1) {
      state = recordFrameDraw(state, { nowMs: tick * 16, playing: true, drawn: false })
    }
    expect(state.dropped).toBe(1)
    state = recordFrameDraw(state, { nowMs: FRAME_INTERVAL_MS * 2, playing: true, drawn: false })
    expect(state.dropped).toBe(2)
  })
})
