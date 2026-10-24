import { describe, expect, it } from 'vitest'
import { advancePlayhead } from '@renderer/features/playback/playbackClock'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { nextShuttleRate } from '@shared/media/shuttle'

describe('shuttle speeds', () => {
  it('starts at 1x in the pressed direction when not already playing that way', () => {
    expect(nextShuttleRate({ playing: false, rate: 1 }, 1)).toBe(1)
    expect(nextShuttleRate({ playing: false, rate: 1 }, -1)).toBe(-1)
    expect(nextShuttleRate({ playing: true, rate: 4 }, -1)).toBe(-1)
  })

  it('speeds up one step per press in the same direction and stops at the top speed', () => {
    expect(nextShuttleRate({ playing: true, rate: 1 }, 1)).toBe(2)
    expect(nextShuttleRate({ playing: true, rate: 2 }, 1)).toBe(4)
    expect(nextShuttleRate({ playing: true, rate: 8 }, 1)).toBe(8)
    expect(nextShuttleRate({ playing: true, rate: -2 }, -1)).toBe(-4)
  })
})

describe('reverse playback', () => {
  it('moves backward at a negative rate and stops at the start', () => {
    const reverse = { playheadMs: 1000, playing: true, rate: -2 }
    expect(advancePlayhead(reverse, 250, 10_000)).toEqual({ playheadMs: 500, playing: true })
    expect(advancePlayhead(reverse, 2000, 10_000)).toEqual({ playheadMs: 0, playing: false })
  })
})

describe('shuttle in the playback store', () => {
  it('plays from the playhead with J and L, and K pauses and returns to 1x', () => {
    playbackStore.setState({ playing: false, playheadMs: 500, rate: 1, durationMs: 10_000 })
    playbackStore.getState().shuttle(1)
    playbackStore.getState().shuttle(1)
    expect(playbackStore.getState()).toMatchObject({ playing: true, rate: 2, playheadMs: 500 })

    playbackStore.getState().pause()
    expect(playbackStore.getState()).toMatchObject({ playing: false, rate: 1 })
  })

  it('starts forward play from the beginning when L is pressed at the end', () => {
    playbackStore.setState({ playing: false, playheadMs: 10_000, rate: 1, durationMs: 10_000 })
    playbackStore.getState().shuttle(1)
    expect(playbackStore.getState()).toMatchObject({ playing: true, playheadMs: 0, rate: 1 })
  })
})
