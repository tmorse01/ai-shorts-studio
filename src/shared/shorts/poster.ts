// The poster frame of a short (Epic 05, #74): which footage frame a short's card shows, and the name
// of its cached image. Pure, so the choice is tested without FFmpeg or the disk. Main and the renderer
// both call posterFileName, so they agree on the file a frame maps to.
import { z } from 'zod'
import type { Clip, Timeline } from '../timeline/timeline'

export interface PosterTarget {
  clipId: string
  mediaId: string
  // Where the frame sits in the media file, in ms.
  sourceTimeMs: number
}

// Ids are used in file paths, so they are limited to safe characters.
const safeId = z.string().regex(/^[A-Za-z0-9_-]+$/)

// Names one poster frame: the short it belongs to, and the footage frame it shows.
export const posterFrameRefSchema = z.object({
  shortId: safeId,
  mediaId: safeId,
  sourceTimeMs: z.number().int().nonnegative()
})
export type PosterFrameRef = z.infer<typeof posterFrameRefSchema>

// The frame a short shows: the frame at posterMs (0 when unset) from the topmost video clip that
// covers that time. If no video clip covers it, the first frame of the earliest video clip is used.
// Null when the timeline has no video clip, so the card shows its placeholder.
export function posterTarget(
  timeline: Timeline,
  posterMs: number | undefined
): PosterTarget | null {
  const tMs = posterMs ?? 0
  let covering: Clip | null = null
  let earliest: Clip | null = null
  for (const track of timeline.tracks) {
    if (track.kind !== 'video') continue
    for (const clip of track.clips) {
      if (!clip.mediaId) continue
      // Later tracks draw over earlier ones, so the last covering clip wins.
      if (tMs >= clip.startMs && tMs < clip.startMs + clip.durationMs) covering = clip
      if (!earliest || clip.startMs < earliest.startMs) earliest = clip
    }
  }
  if (covering?.mediaId) {
    return {
      clipId: covering.id,
      mediaId: covering.mediaId,
      sourceTimeMs: covering.sourceInMs + (tMs - covering.startMs)
    }
  }
  if (earliest?.mediaId) {
    return { clipId: earliest.id, mediaId: earliest.mediaId, sourceTimeMs: earliest.sourceInMs }
  }
  return null
}

// The cache file for one poster frame. The name changes when the footage or the frame changes, so a
// changed frame is rendered again and an unchanged one is reused.
export function posterFileName(frame: Pick<PosterFrameRef, 'mediaId' | 'sourceTimeMs'>): string {
  return `${frame.mediaId}-${frame.sourceTimeMs}.jpg`
}
