// Turns a footage drop on a video lane (Main or an overlay) into a clip, and an image drop on an Overlay
// track into an image overlay clip (Epic 13, #129). Pure, so the rules are tested without the DOM. Only
// video footage goes on a video lane and only images go on an Overlay track. A moment keeps its id on the
// clip, so the clip can show which beat it came from. The drop is one insert (Main) or one append (overlays),
// so no new edit is needed.
import type { MediaRef } from '../project/schema'
import { IMAGE_OVERLAY_DEFAULT_MS } from '../image/imageItem'
import type { DragPayload } from './dragPayload'
import { IDENTITY_TRANSFORM, type Clip, type Track } from './timeline'

function endOf(clip: Clip): number {
  return clip.startMs + clip.durationMs
}

export type FootageDropResult =
  { ok: true; clip: Clip; startMs: number } | { ok: false; reason: string }

// Where a footage drop at atMs lands on a track. Main is a sequence, so a point inside a clip snaps
// to that clip's nearer edge, as placeClips does. Free layers take the time as it is.
export function footageInsertMs(track: Track, atMs: number): number {
  const at = Math.max(0, Math.round(atMs))
  if (track.role !== 'main') return at
  const inside = track.clips.find((clip) => clip.startMs < at && at < endOf(clip))
  if (!inside) return at
  return at - inside.startMs <= endOf(inside) - at ? inside.startMs : endOf(inside)
}

export function footageClipForDrop(
  payload: DragPayload,
  media: readonly MediaRef[],
  track: Track,
  clipId: string,
  atMs: number
): FootageDropResult {
  if (track.kind === 'overlay') return imageClipForDrop(payload, media, clipId, atMs, track)
  if (track.kind !== 'video') {
    return { ok: false, reason: 'Footage can only go on a video track.' }
  }
  const ref = media.find((item) => item.id === payload.mediaId)
  if (!ref) return { ok: false, reason: 'That file is no longer in the project.' }
  if (ref.kind !== 'video') {
    return { ok: false, reason: 'Only video files can go on a video track.' }
  }
  const clip: Clip = {
    id: clipId,
    mediaId: ref.id,
    startMs: footageInsertMs(track, atMs),
    durationMs: payload.outMs - payload.inMs,
    sourceInMs: payload.inMs,
    transform: { ...IDENTITY_TRANSFORM },
    ...(payload.kind === 'moment' ? { momentId: payload.momentId } : {})
  }
  return { ok: true, clip, startMs: clip.startMs }
}

// An image dropped on an Overlay track: a logo, map or sticker. It lasts IMAGE_OVERLAY_DEFAULT_MS, since an
// image has no length of its own, and the drag's range is ignored.
function imageClipForDrop(
  payload: DragPayload,
  media: readonly MediaRef[],
  clipId: string,
  atMs: number,
  track: Track
): FootageDropResult {
  const ref = media.find((item) => item.id === payload.mediaId)
  if (!ref) return { ok: false, reason: 'That file is no longer in the project.' }
  if (ref.kind !== 'image') {
    return { ok: false, reason: 'Only image files can go on an Overlay track.' }
  }
  const clip: Clip = {
    id: clipId,
    mediaId: ref.id,
    startMs: footageInsertMs(track, atMs),
    durationMs: IMAGE_OVERLAY_DEFAULT_MS,
    sourceInMs: 0,
    transform: { ...IDENTITY_TRANSFORM },
    imageItem: {}
  }
  return { ok: true, clip, startMs: clip.startMs }
}
