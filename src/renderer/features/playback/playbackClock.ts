// Pure playback maths shared by the preview, the timeline playhead and the scrub bar. No DOM, no
// store, so the rules (stop at the end, frame steps, timecode) are tested directly.

// The frame rate the editor steps and displays in. Arrow keys move one frame at this rate.
export const FRAME_RATE = 30
export const FRAME_MS = 1000 / FRAME_RATE

export function clampToDuration(ms: number, durationMs: number): number {
  return Math.min(Math.max(ms, 0), Math.max(durationMs, 0))
}

// Moves the playhead by elapsed time at the given rate. Reaching the end stops playback there.
export function advancePlayhead(
  state: { playheadMs: number; playing: boolean; rate: number },
  elapsedMs: number,
  durationMs: number
): { playheadMs: number; playing: boolean } {
  const next = state.playheadMs + elapsedMs * state.rate
  if (next >= durationMs) return { playheadMs: Math.max(durationMs, 0), playing: false }
  return { playheadMs: Math.max(next, 0), playing: state.playing }
}

export function stepFrame(ms: number, direction: 1 | -1, durationMs: number): number {
  return clampToDuration(ms + direction * FRAME_MS, durationMs)
}

// Timecode as MM:SS:FF, where FF is the frame number within the second.
export function formatTimecode(ms: number): string {
  const totalFrames = Math.floor((Math.max(ms, 0) * FRAME_RATE) / 1000)
  const frames = totalFrames % FRAME_RATE
  const totalSeconds = Math.floor(totalFrames / FRAME_RATE)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)
  return [minutes, seconds, frames].map((part) => String(part).padStart(2, '0')).join(':')
}
