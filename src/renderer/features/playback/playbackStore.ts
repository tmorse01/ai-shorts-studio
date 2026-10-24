// The one playback state for the editor. The preview and the timeline playhead both read it through
// selectors. The clock (usePlaybackClock) moves the playhead while playing.
import { createStore } from 'zustand'
import { advancePlayhead, clampToDuration, stepFrame } from './playbackClock'
import { nextShuttleRate } from '@shared/media/shuttle'

export interface PlaybackState {
  playing: boolean
  playheadMs: number
  rate: number
  durationMs: number
}

export interface PlaybackActions {
  play: () => void
  pause: () => void
  toggle: () => void
  // J (-1) or L (+1): speeds up while pressed in the same direction, otherwise starts at 1x.
  shuttle: (direction: 1 | -1) => void
  seek: (ms: number) => void
  step: (direction: 1 | -1) => void
  // Moves the playhead by elapsed time. Stops at the end of the timeline.
  tick: (elapsedMs: number) => void
  setDurationMs: (durationMs: number) => void
  setRate: (rate: number) => void
}

export type PlaybackStore = PlaybackState & PlaybackActions

export const playbackStore = createStore<PlaybackStore>()((set, get) => ({
  playing: false,
  playheadMs: 0,
  rate: 1,
  durationMs: 0,
  play: () => {
    const { playheadMs, durationMs } = get()
    // Play from the end starts again from the beginning.
    const atEnd = durationMs > 0 && playheadMs >= durationMs
    set({ playing: true, rate: 1, playheadMs: atEnd ? 0 : playheadMs })
  },
  shuttle: (direction) => {
    const { playheadMs, durationMs } = get()
    const rate = nextShuttleRate(get(), direction)
    // Forward from the end starts again from the beginning, as play does.
    const atEnd = direction === 1 && durationMs > 0 && playheadMs >= durationMs
    set({ playing: true, rate, playheadMs: atEnd ? 0 : playheadMs })
  },
  // Pausing (K) also returns the rate to 1x, so the next play starts at normal speed.
  pause: () => set({ playing: false, rate: 1 }),
  toggle: () => (get().playing ? get().pause() : get().play()),
  seek: (ms) => set((state) => ({ playheadMs: clampToDuration(ms, state.durationMs) })),
  step: (direction) =>
    set((state) => ({
      playing: false,
      rate: 1,
      playheadMs: stepFrame(state.playheadMs, direction, state.durationMs)
    })),
  tick: (elapsedMs) => {
    const next = advancePlayhead(get(), elapsedMs, get().durationMs)
    set(next)
  },
  setDurationMs: (durationMs) =>
    set((state) => ({
      durationMs: Math.max(durationMs, 0),
      playheadMs: clampToDuration(state.playheadMs, durationMs)
    })),
  setRate: (rate) => set({ rate: rate > 0 ? rate : 1 })
}))
