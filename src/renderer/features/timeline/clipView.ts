// Pure layout for timeline clips (Epic 07, #86): where a clip sits, which clips are on screen, the
// label, and which part of a filmstrip or waveform each clip shows. No DOM, so each rule is tested.
import type { FilmstripPlan } from '@shared/media/thumbs'
import type { Clip } from '@shared/timeline/timeline'
import { envelopeWithin, type EnvelopePoint } from '@shared/timeline/ducking'
import { timeToX } from './timelineView'

// How far past each edge of the viewport clips are still rendered, so a scroll shows no pop-in.
export const CLIP_OVERSCAN_PX = 240

export interface ClipBox {
  leftPx: number
  widthPx: number
}

export interface LaneRange {
  fromPx: number
  toPx: number
}

export function clipBox(clip: Clip, pxPerMs: number): ClipBox {
  return { leftPx: timeToX(clip.startMs, pxPerMs), widthPx: timeToX(clip.durationMs, pxPerMs) }
}

// The lane x range on screen, in lane coordinates. The lane header is headerPx wide and sits in
// front of the lane body, so the body starts at the header's right edge.
export function visibleLaneRange(
  scrollLeft: number,
  viewWidthPx: number,
  headerPx: number,
  overscanPx: number = CLIP_OVERSCAN_PX
): LaneRange {
  return {
    fromPx: Math.max(scrollLeft - headerPx - overscanPx, 0),
    toPx: Math.max(scrollLeft + viewWidthPx - headerPx + overscanPx, 0)
  }
}

// The clips that overlap the range. Clips outside it are not rendered at all.
export function clipsInRange(clips: readonly Clip[], pxPerMs: number, range: LaneRange): Clip[] {
  return clips.filter((clip) => {
    const box = clipBox(clip, pxPerMs)
    return box.leftPx < range.toPx && box.leftPx + box.widthPx > range.fromPx
  })
}

// The moment name when the clip has one, then its text, then the source file name.
export function clipLabel(clip: Clip, mediaName?: string): string {
  return clip.label?.trim() || clip.text?.trim() || mediaName || 'Clip'
}

export interface FilmTile {
  // Left edge within the clip, in pixels.
  leftPx: number
  // Column and row of the frame in the filmstrip sprite.
  col: number
  row: number
}

// The filmstrip tiles that cover the visible part of a clip. Each tile is one frame, one tile wide,
// placed where its source time falls on the timeline. Tiles outside fromPx..toPx are skipped.
export function filmstripTiles(args: {
  sourceInMs: number
  plan: FilmstripPlan
  pxPerMs: number
  tileWidthPx: number
  widthPx: number
  fromPx: number
  toPx: number
}): FilmTile[] {
  const { plan, pxPerMs, tileWidthPx, widthPx } = args
  if (tileWidthPx <= 0 || widthPx <= 0 || pxPerMs <= 0) return []

  const first = Math.max(Math.floor(Math.max(args.fromPx, 0) / tileWidthPx), 0)
  const last = Math.ceil(Math.min(args.toPx, widthPx) / tileWidthPx)
  const intervalMs = plan.intervalSec * 1000
  const tiles: FilmTile[] = []

  for (let index = first; index < last; index += 1) {
    const leftPx = index * tileWidthPx
    const sourceMs = args.sourceInMs + leftPx / pxPerMs
    const frame = Math.min(Math.floor(sourceMs / intervalMs), plan.frames - 1)
    tiles.push({ leftPx, col: frame % plan.columns, row: Math.floor(frame / plan.columns) })
  }
  return tiles
}

// The gain line of a music clip: the ducking envelope across the clip, as SVG points in clip-local
// pixels. Full gain sits near the top of the clip and a drop moves the line down.
export function gainLinePoints(
  clip: Clip,
  envelope: readonly EnvelopePoint[],
  pxPerMs: number,
  heightPx: number
): string {
  const padPx = 6
  return envelopeWithin(envelope, clip.startMs, clip.startMs + clip.durationMs)
    .map((point) => {
      const x = (point.tMs - clip.startMs) * pxPerMs
      const y = padPx + (1 - point.gain) * (heightPx - 2 * padPx)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export interface SourceStrip {
  // Width of the whole media's image, scaled so the clip's source span lines up with the clip.
  imageWidthPx: number
  // Horizontal offset of that image, so the clip's source-in point is at the clip's left edge.
  offsetPx: number
}

// Maps a whole-file image (a waveform) onto a clip. Null when the media length is not known, since
// the image cannot be scaled without it.
export function sourceStrip(
  clip: Clip,
  mediaDurationMs: number | undefined,
  pxPerMs: number
): SourceStrip | null {
  if (mediaDurationMs === undefined || mediaDurationMs <= 0 || clip.durationMs <= 0) return null
  const widthPx = timeToX(clip.durationMs, pxPerMs)
  return {
    imageWidthPx: (widthPx * mediaDurationMs) / clip.durationMs,
    offsetPx: -(clip.sourceInMs / clip.durationMs) * widthPx
  }
}

// What a trim tooltip shows: the clip's new length, and the source time at the edge being dragged.
// The source time at the start edge is the clip's In point; at the end edge it is the Out point.
export function trimReadout(
  clip: Clip,
  edge: 'start' | 'end'
): { durationMs: number; sourceMs: number } {
  const sourceMs = edge === 'start' ? clip.sourceInMs : clip.sourceInMs + clip.durationMs
  return { durationMs: clip.durationMs, sourceMs }
}
