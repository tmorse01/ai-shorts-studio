// The render description for one frame of a short (Epic 06, #78). Pure data: which layers draw at a
// time, in draw order, and where each one sits on the 1080x1920 canvas. The preview draws it, and
// export (Epic 17) can draw the same description. No DOM, no store.
import { resolveFrame, type ResolvedLayer } from '../timeline/resolveFrame'
import type { Timeline, Transform } from '../timeline/timeline'

export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1920

export interface SourceSize {
  width: number
  height: number
}

export interface Placement {
  // Centre of the layer in canvas pixels, measured from the top-left corner.
  centerX: number
  centerY: number
  width: number
  height: number
  rotationDeg: number
}

export interface FrameLayer extends ResolvedLayer {
  placement: Placement
}

export interface FrameDescription {
  width: number
  height: number
  tMs: number
  // Bottom to top: a later layer draws over an earlier one.
  layers: FrameLayer[]
}

// Fits the source inside the canvas at its aspect ratio, then applies the clip transform: scale about
// the centre, offset by x and y, and rotate. A source of unknown size fills the canvas.
export function placeTransform(transform: Transform, source: SourceSize | null): Placement {
  let baseWidth = CANVAS_WIDTH
  let baseHeight = CANVAS_HEIGHT
  if (source && source.width > 0 && source.height > 0) {
    const fit = Math.min(CANVAS_WIDTH / source.width, CANVAS_HEIGHT / source.height)
    baseWidth = source.width * fit
    baseHeight = source.height * fit
  }
  return {
    centerX: CANVAS_WIDTH / 2 + transform.x,
    centerY: CANVAS_HEIGHT / 2 + transform.y,
    width: baseWidth * transform.scale,
    height: baseHeight * transform.scale,
    rotationDeg: transform.rotationDeg
  }
}

// What is on the canvas at tMs. `sizeOf` gives the pixel size of a media item once it is known, so
// video fits at its own aspect ratio. Until then the layer fills the canvas.
export function describeFrame(
  timeline: Timeline,
  tMs: number,
  sizeOf: (mediaId: string) => SourceSize | null = () => null
): FrameDescription {
  const layers = resolveFrame(timeline, tMs).map((layer) => ({
    ...layer,
    placement: placeTransform(layer.transform, layer.mediaId ? sizeOf(layer.mediaId) : null)
  }))
  return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, tMs, layers }
}

// True when at least one track holds a clip. A short with no clips shows the empty state.
export function hasClips(timeline: Timeline): boolean {
  return timeline.tracks.some((track) => track.clips.length > 0)
}
