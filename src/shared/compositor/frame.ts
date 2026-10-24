// The render description for one frame of a short (Epic 06, #78). Pure data: which layers draw at a
// time, in draw order, and where each one sits on the 1080x1920 canvas. The preview draws it, and
// export (Epic 17) can draw the same description. No DOM, no store.
import {
  framingCropRect,
  poseOf,
  type ClipFraming,
  type FramingMode,
  type FramingPose
} from '../timeline/framing'
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
  // The pixel size of the layer's source, when it is known. The canvas gizmo needs it to turn a drag
  // into a framing change.
  source?: SourceSize
}

// Places a fill-mode framed video: the crop of the source (see framingCropRect) is scaled to cover the
// canvas, and the transform is applied on top of that. Without a known source size, the layer fills the
// canvas as before.
export function placeFramed(
  transform: Transform,
  framing: { mode: FramingMode } & FramingPose,
  source: SourceSize
): Placement {
  const crop = framingCropRect(source.width, source.height, CANVAS_WIDTH, CANVAS_HEIGHT, framing)
  const perSource = CANVAS_WIDTH / crop.width
  // Where the source centre falls, so that the crop centre lands on the canvas centre.
  const offsetX = (source.width / 2 - (crop.x + crop.width / 2)) * perSource
  const offsetY = (source.height / 2 - (crop.y + crop.height / 2)) * perSource
  return {
    centerX: CANVAS_WIDTH / 2 + offsetX + transform.x,
    centerY: CANVAS_HEIGHT / 2 + offsetY + transform.y,
    width: source.width * perSource * transform.scale,
    height: source.height * perSource * transform.scale * (transform.stretch ?? 1),
    rotationDeg: transform.rotationDeg
  }
}

// The outline of a fill crop on the canvas, for the start and end poses of a pan. The crop is drawn over
// the source as it fits the canvas with no framing (base), so the outline does not move with the crop.
// The outline turns with the layer's rotation. It is null for a clip that is not fill-framed or has no
// known source size.
export function framingOutlines(
  source: SourceSize,
  base: Placement,
  framing: ClipFraming
): { start: Placement; end: Placement | null } | null {
  if (framing.mode !== 'fill' || source.width <= 0 || source.height <= 0) return null
  const outline = (pose: FramingPose): Placement => {
    const crop = framingCropRect(source.width, source.height, CANVAS_WIDTH, CANVAS_HEIGHT, {
      mode: 'fill',
      ...pose
    })
    const kx = base.width / source.width
    const ky = base.height / source.height
    // Offset of the crop centre from the source centre, in canvas pixels before rotation.
    const dx = (crop.x + crop.width / 2 - source.width / 2) * kx
    const dy = (crop.y + crop.height / 2 - source.height / 2) * ky
    const radians = (base.rotationDeg * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return {
      centerX: base.centerX + dx * cos - dy * sin,
      centerY: base.centerY + dx * sin + dy * cos,
      width: crop.width * kx,
      height: crop.height * ky,
      rotationDeg: base.rotationDeg
    }
  }
  const start = outline(poseOf(framing, 'start'))
  return { start, end: framing.panTo ? outline(poseOf(framing, 'end')) : null }
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
    const framing = layer.trackKind === 'video' ? layer.framing : undefined
    const placement =
      framing?.mode === 'fill' && source && source.width > 0 && source.height > 0
        ? placeFramed(layer.transform, framing, source)
        : placeTransform(layer.transform, source)
    return {
      ...layer,
      placement,
      render: describeLayerRender(placement, framing, source),
      ...(source && source.width > 0 && source.height > 0 ? { source } : {})
    }
  })
  return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, tMs, layers }
}

// True when at least one track holds a clip. A short with no clips shows the empty state.
export function hasClips(timeline: Timeline): boolean {
  return timeline.tracks.some((track) => track.clips.length > 0)
}
