// Finds the text overlay a timeline clip is: a clip with a textItem on a text track (Epic 13, #127). The
// captions lane is also a text-kind track, but it holds caption blocks, not overlays. No DOM, no store.
import type { Clip, Timeline, Track } from '../timeline/timeline'
import type { TextItem } from './textItem'

export interface TextOverlay {
  track: Track
  clip: Clip & { textItem: TextItem }
}

// The overlay of a clip, or null when the clip is not a text overlay on a text track.
export function textOverlayOf(timeline: Timeline, clipId: string): TextOverlay | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (!clip) continue
    if (track.kind !== 'text' || track.role !== 'text' || !clip.textItem) return null
    return { track, clip: { ...clip, textItem: clip.textItem } }
  }
  return null
}
