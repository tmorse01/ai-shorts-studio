// The surface a frame is drawn onto. WebGL is preferred and the 2D canvas is the fallback. Both fill
// the same 1080x1920 buffer, and CSS scales that buffer to the centre pane.
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Placement } from '@shared/compositor/frame'
import { createCanvas2DBackend } from './canvas2dBackend'
import { createWebGLBackend } from './webglBackend'

// What a frame starts from. Black is the fixed value a dip to black needs; it is not a theme colour.
export type FrameBackground = 'transparent' | 'black'

export interface VideoEffect {
  // Blur radius in canvas pixels, and darkening from 0 (none) to 1 (black).
  blurPx: number
  dim: number
}

// A rasterised layer: a text or caption canvas, or a loaded image (an image overlay, Epic 13, #129).
export type BitmapSource = HTMLCanvasElement | HTMLImageElement

export interface FrameBackend {
  readonly kind: 'webgl' | '2d'
  clear(background?: FrameBackground): void
  // Draws a video frame at its placement. The element must already hold a decoded frame. `effect`
  // blurs and darkens the frame (the blurFit background); without it the frame is drawn as is.
  drawVideo(
    video: HTMLVideoElement,
    placement: Placement,
    effect?: VideoEffect,
    // Alpha from 0 to 1 over what is already drawn. Default 1.
    opacity?: number
  ): void
  // Draws a rasterised layer, such as a text overlay, at its placement. Alpha as for drawVideo.
  drawBitmap(bitmap: BitmapSource, placement: Placement, opacity?: number): void
  dispose(): void
}

export function createFrameBackend(canvas: HTMLCanvasElement): FrameBackend {
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  try {
    const webgl = createWebGLBackend(canvas)
    if (webgl) return webgl
  } catch {
    // A shader that fails to build takes the canvas's context with it, so the 2D fallback may draw
    // nothing. The preview stays blank rather than crashing the window.
  }
  return createCanvas2DBackend(canvas)
}
