import type { FrameBackend, FrameBackground } from './frameBackend'

// The fallback backend. Each layer is drawn with the 2D context's transform, rotated about its centre.
export function createCanvas2DBackend(canvas: HTMLCanvasElement): FrameBackend {
  const context = canvas.getContext('2d')
  return {
    kind: '2d',
    clear(background: FrameBackground = 'transparent') {
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (background === 'black') {
        context.fillStyle = 'black'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
    },
    drawVideo(video, placement, opacity = 1) {
      if (!context) return
      context.save()
      context.globalAlpha = opacity
      context.translate(placement.centerX, placement.centerY)
      context.rotate((placement.rotationDeg * Math.PI) / 180)
      context.drawImage(
        video,
        -placement.width / 2,
        -placement.height / 2,
        placement.width,
        placement.height
      )
      context.restore()
    },
    dispose() {}
  }
}
