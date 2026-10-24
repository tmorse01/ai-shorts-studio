// Pure rules for the preview: which clip starts to cue ahead of the playhead, which layer's frame to
// show, and when a video element has drifted far enough from the playhead to seek. No DOM, no store.
import { nextClipBoundary, resolveFrame, type ResolvedLayer } from '@shared/timeline/resolveFrame'
import type { Timeline } from '@shared/timeline/timeline'

export const EMPTY_TIMELINE: Timeline = { tracks: [] }

export interface PreloadTarget {
  mediaId: string
  // Where the clip starts on the timeline.
  startMs: number
  // Where in the source the clip starts playing.
  sourceMs: number
}

// The video clips that start at each of the next `lookahead` clip boundaries after the playhead.
// Those clips are cued so their first frame is ready when the playhead gets there.
export function planPreloads(
  timeline: Timeline,
  playheadMs: number,
  lookahead: number
): PreloadTarget[] {
  const targets: PreloadTarget[] = []
  let from = playheadMs
  for (let step = 0; step < lookahead; step += 1) {
    const boundary = nextClipBoundary(timeline, from)
    if (boundary === null) break
    for (const track of timeline.tracks) {
      if (track.kind !== 'video' || track.muted) continue
      for (const clip of track.clips) {
        if (clip.startMs === boundary && clip.mediaId) {
          targets.push({ mediaId: clip.mediaId, startMs: boundary, sourceMs: clip.sourceInMs })
        }
      }
    }
    from = boundary
  }
  return targets
}

// The layer whose frame fills the preview: the topmost video layer that has footage.
export function topVideoLayer(layers: readonly ResolvedLayer[]): ResolvedLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (layer.trackKind === 'video' && layer.mediaId) return layer
  }
  return null
}

export function topVideoLayerAt(timeline: Timeline, playheadMs: number): ResolvedLayer | null {
  return topVideoLayer(resolveFrame(timeline, playheadMs))
}

// Seek only when the element is off by more than a frame while paused, or by a few tenths of a
// second while playing. Smaller differences would seek on every tick for no visible gain.
export function needsSeek(currentSec: number, targetSec: number, playing: boolean): boolean {
  const tolerance = playing ? 0.3 : 1 / 60
  return Math.abs(currentSec - targetSec) > tolerance
}
