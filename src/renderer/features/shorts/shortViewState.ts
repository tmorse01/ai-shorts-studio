// Per-short view state for the editor: the playhead and the timeline zoom. Each short keeps its own
// values while the session runs, so switching shorts brings back where you were. The values are kept
// in memory only. They are not part of the short, so they are not saved or undone.
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { DEFAULT_PX_PER_MS } from '@renderer/features/timeline/timelineView'
import { timelineViewStore } from '@renderer/features/timeline/timelineViewStore'

export interface ShortViewState {
  playheadMs: number
  pxPerMs: number
}

const DEFAULT_VIEW_STATE: ShortViewState = { playheadMs: 0, pxPerMs: DEFAULT_PX_PER_MS }

const saved = new Map<string, ShortViewState>()

export function readShortViewState(shortId: string): ShortViewState {
  return saved.get(shortId) ?? DEFAULT_VIEW_STATE
}

// Stores the current playhead and zoom under the short that is being left.
export function captureShortViewState(shortId: string): void {
  saved.set(shortId, {
    playheadMs: playbackStore.getState().playheadMs,
    pxPerMs: timelineViewStore.getState().pxPerMs
  })
}

// Puts a short's saved playhead and zoom back into the editor. Playback is paused on the way in.
export function restoreShortViewState(shortId: string): void {
  const state = readShortViewState(shortId)
  playbackStore.setState({ playing: false, playheadMs: state.playheadMs })
  timelineViewStore.setState({ pxPerMs: state.pxPerMs })
}
