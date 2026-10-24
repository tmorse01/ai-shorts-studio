// The dev-only dropped-frame counter. While playing, a frame is dropped when the preview had to hold
// the last frame because footage was not decoded yet. Pure, so the counting rules are tested without
// a DOM. At most one frame is counted per frame interval, so a long hold counts once per frame due.

export const FRAME_INTERVAL_MS = 1000 / 30

export interface DroppedFrameState {
  // When a dropped frame was last counted, or null before the first one.
  lastCountedMs: number | null
  dropped: number
}

export const NO_DROPPED_FRAMES: DroppedFrameState = { lastCountedMs: null, dropped: 0 }

export function recordFrameDraw(
  state: DroppedFrameState,
  event: { nowMs: number; playing: boolean; drawn: boolean }
): DroppedFrameState {
  if (!event.playing || event.drawn) return state
  if (state.lastCountedMs !== null && event.nowMs - state.lastCountedMs < FRAME_INTERVAL_MS) {
    return state
  }
  return { lastCountedMs: event.nowMs, dropped: state.dropped + 1 }
}
