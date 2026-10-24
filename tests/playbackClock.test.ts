import { describe, expect, it } from 'vitest'
import {
  advancePlayhead,
  clampToDuration,
  formatTimecode,
  FRAME_MS,
  stepFrame
} from '@renderer/features/playback/playbackClock'
import { playbackStore } from '@renderer/features/playback/playbackStore'

describe('playback maths', () => {
  it('advances by elapsed time at the rate, and stops at the end', () => {
    const playing = { playheadMs: 1000, playing: true, rate: 2 }
    expect(advancePlayhead(playing, 250, 10_000)).toEqual({ playheadMs: 1500, playing: true })
    expect(advancePlayhead(playing, 5000, 4000)).toEqual({ playheadMs: 4000, playing: false })
  })

  it('steps one frame forward or back and clamps to the timeline', () => {
    expect(stepFrame(0, -1, 1000)).toBe(0)
    expect(stepFrame(0, 1, 1000)).toBeCloseTo(FRAME_MS)
    expect(stepFrame(1000, 1, 1000)).toBe(1000)
  })

  it('clamps a time to the duration and never below zero', () => {
    expect(clampToDuration(-5, 100)).toBe(0)
    expect(clampToDuration(150, 100)).toBe(100)
  })

  it('formats timecode as MM:SS:FF at 30 frames a second', () => {
    expect(formatTimecode(0)).toBe('00:00:00')
    expect(formatTimecode(1000 + 500)).toBe('00:01:15')
    expect(formatTimecode(61_000)).toBe('01:01:00')
  })
})

describe('playback store', () => {
  function reset(durationMs: number) {
    playbackStore.setState({ playing: false, playheadMs: 0, rate: 1, durationMs })
  }

  it('moves the playhead while playing and stops at the end', () => {
    reset(1000)
    playbackStore.getState().play()
    playbackStore.getState().tick(400)
    expect(playbackStore.getState().playheadMs).toBe(400)
    playbackStore.getState().tick(2000)
    expect(playbackStore.getState()).toMatchObject({ playing: false, playheadMs: 1000 })
  })

  it('restarts from zero when play is pressed at the end', () => {
    reset(1000)
    playbackStore.getState().seek(1000)
    playbackStore.getState().play()
    expect(playbackStore.getState()).toMatchObject({ playing: true, playheadMs: 0 })
  })

  it('pauses when stepping a frame and clamps seeks to the timeline', () => {
    reset(1000)
    playbackStore.getState().play()
    playbackStore.getState().step(1)
    expect(playbackStore.getState().playing).toBe(false)
    playbackStore.getState().seek(5000)
    expect(playbackStore.getState().playheadMs).toBe(1000)
  })
})
