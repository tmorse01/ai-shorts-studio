// The surface a frame is drawn onto. WebGL is preferred and the 2D canvas is the fallback. Both fill
// the same 1080x1920 buffer, and CSS scales that buffer to the centre pane.
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Placement } from '@shared/compositor/frame'
import { createCanvas2DBackend } from './canvas2dBackend'
import { createWebGLBackend } from './webglBackend'

export interface FrameBackend {
  readonly kind: 'webgl' | '2d'
  clear(): void
  // Draws a video frame at its placement. The element must already hold a decoded frame.
  drawVideo(video: HTMLVideoElement, placement: Placement): void
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
