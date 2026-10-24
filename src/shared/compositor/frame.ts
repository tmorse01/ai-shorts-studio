// The render description for one frame of a short (Epic 06, #78). Pure data: which layers draw at a
// time, in draw order, and where each one sits on the 1080x1920 canvas. The preview draws it, and
// export (Epic 17) can draw the same description. No DOM, no store.
import type { FramingMode } from '../timeline/framing'
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

// The project defaults for the blurFit framing (Epic 09, #103). No settings field exists for them yet,
// so they live here as the one place to change or replace with a project setting.
export const BLUR_FIT_DEFAULTS = {
  // Blur radius in canvas pixels.
  blurPx: 40,
  // How much the blurred copy is darkened, 0 (none) to 1 (black).
  dim: 0.35
} as const

// How a layer is drawn. 'direct' draws its placement as is. 'blurFit' draws a background first, the
// source covering the canvas and blurred and dimmed, then the foreground (the whole source fitted
// inside the canvas) over it.
export type LayerRender =
  | { mode: 'direct' }
  | {
      mode: 'blurFit'
      blurPx: number
      dim: number
      background: Placement
      foreground: Placement
    }

export interface FrameLayer extends ResolvedLayer {
  placement: Placement
  render: LayerRender
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
    height: baseHeight * transform.scale * (transform.stretch ?? 1),
    rotationDeg: transform.rotationDeg
  }
}

// The background for a blurFit layer: the source scaled to cover the canvas, centred and unrotated.
// It is padded by `marginPx` on every side, so the blur does not fade out at the canvas edge. A source
// of unknown size fills the padded area.
export function coverPlacement(source: SourceSize | null, marginPx: number): Placement {
  const targetWidth = CANVAS_WIDTH + marginPx * 2
  const targetHeight = CANVAS_HEIGHT + marginPx * 2
  let width = targetWidth
  let height = targetHeight
  if (source && source.width > 0 && source.height > 0) {
    const cover = Math.max(targetWidth / source.width, targetHeight / source.height)
    width = source.width * cover
    height = source.height * cover
  }
  return {
    centerX: CANVAS_WIDTH / 2,
    centerY: CANVAS_HEIGHT / 2,
    width,
    height,
    rotationDeg: 0
  }
}

// How a layer is drawn. Only a video layer framed as blurFit gets the blurred background. Every other
// layer, including a video with fill or no framing, is drawn direct at its placement.
export function describeLayerRender(
  placement: Placement,
  framing: { mode: FramingMode } | undefined,
  source: SourceSize | null
): LayerRender {
  if (framing?.mode !== 'blurFit') return { mode: 'direct' }
  const { blurPx, dim } = BLUR_FIT_DEFAULTS
  return {
    mode: 'blurFit',
    blurPx,
    dim,
    background: coverPlacement(source, blurPx * 2),
    foreground: placement
  }
}

// What is on the canvas at tMs. `sizeOf` gives the pixel size of a media item once it is known, so
// video fits at its own aspect ratio. Until then the layer fills the canvas.
export function describeFrame(
  timeline: Timeline,
  tMs: number,
  sizeOf: (mediaId: string) => SourceSize | null = () => null
): FrameDescription {
  const layers = resolveFrame(timeline, tMs).map((layer) => {
    const source = layer.mediaId ? sizeOf(layer.mediaId) : null
    const placement = placeTransform(layer.transform, source)
    return {
      ...layer,
      placement,
      render: describeLayerRender(
        placement,
        layer.trackKind === 'video' ? layer.framing : undefined,
        source
      )
    }
  })
  return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, tMs, layers }
}

// True when at least one track holds a clip. A short with no clips shows the empty state.
export function hasClips(timeline: Timeline): boolean {
  return timeline.tracks.some((track) => track.clips.length > 0)
}
