// Which overlay layers the export graph draws, and how (Epic 17, #150). Text overlays and caption blocks go
// through an ASS script, built from the shared descriptions (see overlaySubtitles.ts). An image overlay is a
// still picture: it becomes a looped input and is moved per frame (see motionExpressions.ts). Pure.
import type { Timeline } from '../timeline/timeline'

export type OverlayPlanEntry =
  | {
      kind: 'ass'
      // The text clip's id, or the caption block's id. It matches the layer's clipId in the frame.
      key: string
      source: 'text' | 'caption'
      trackId: string
    }
  | {
      kind: 'still-input'
      // The image clip's id, and the media id of the picture it reads.
      key: string
      mediaId: string
      trackId: string
    }

// The overlay layers in the timeline, in track order. Video and sound clips are not overlays, so they are
// left out: the video graph and the sound graph draw them. Muted tracks are still listed, so a caller that
// needs the full set can filter them itself.
export function planOverlays(timeline: Timeline): OverlayPlanEntry[] {
  const plan: OverlayPlanEntry[] = []
  for (const track of timeline.tracks) {
    if (track.role === 'captions') {
      for (const block of track.captions ?? []) {
        plan.push({ kind: 'ass', key: block.id, source: 'caption', trackId: track.id })
      }
    }
    for (const clip of track.clips) {
      if (clip.textItem) {
        plan.push({ kind: 'ass', key: clip.id, source: 'text', trackId: track.id })
      } else if (track.kind === 'overlay' && clip.imageItem && clip.mediaId) {
        plan.push({ kind: 'still-input', key: clip.id, mediaId: clip.mediaId, trackId: track.id })
      }
    }
  }
  return plan
}
