// The one playback state for the editor. The preview and the timeline playhead both read it through
// selectors. The clock (usePlaybackClock) moves the playhead while playing.
import { createStore } from 'zustand'
import { advancePlayhead, clampToDuration, stepFrame } from './playbackClock'

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
    set({ playing: true, playheadMs: atEnd ? 0 : playheadMs })
  },
  pause: () => set({ playing: false }),
  toggle: () => (get().playing ? get().pause() : get().play()),
  seek: (ms) => set((state) => ({ playheadMs: clampToDuration(ms, state.durationMs) })),
  step: (direction) =>
    set((state) => ({
      playing: false,
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
