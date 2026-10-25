// Rasterises a caption block onto a 2D canvas (Epic 11, #119). The layout comes from the pure description
// in @shared/captions/captionLayout; this file only draws it. Each word is drawn in the fill colour, or in
// the highlight colour when it is the word being spoken. Bitmaps are cached by their look and highlight
// state, and kept only once the font has loaded, as the text overlay does.
import type { CaptionRender } from '@shared/captions/captionLayout'
import { fontLoaded } from './textBitmap'

const CACHE_LIMIT = 48
const cache = new Map<string, HTMLCanvasElement>()

function lookKey(render: CaptionRender): string {
  return JSON.stringify([
    render.lines,
    render.fontCss,
    render.letterSpacingPx,
    render.lineHeightPx,
    render.fill,
    render.highlightFill,
    render.stroke
  ])
}

function rasterise(render: CaptionRender): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const probe = canvas.getContext('2d')
  if (!probe) return canvas
  probe.font = render.fontCss
  probe.letterSpacing = `${render.letterSpacingPx}px`
  const spaceWidth = probe.measureText(' ').width
  const lineWidths = render.lines.map((line) =>
    line.reduce(
      (total, word, index) =>
        total + probe.measureText(word.text).width + (index > 0 ? spaceWidth : 0),
      0
    )
  )
  const pad = render.stroke ? Math.ceil(render.stroke.widthPx) : 0
  canvas.width = Math.max(1, Math.ceil(Math.max(0, ...lineWidths) + pad * 2))
  canvas.height = Math.max(1, Math.ceil(render.lineHeightPx * render.lines.length + pad * 2))
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.font = render.fontCss
  context.letterSpacing = `${render.letterSpacingPx}px`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  render.lines.forEach((line, lineIndex) => {
    const y = pad + render.lineHeightPx * (lineIndex + 0.5)
    let x = (canvas.width - (lineWidths[lineIndex] ?? 0)) / 2
    line.forEach((word, index) => {
      if (index > 0) x += spaceWidth
      if (render.stroke) {
        // The stroke is centred on the outline, so double its width to show widthPx outside it.
        context.lineWidth = render.stroke.widthPx * 2
        context.strokeStyle = render.stroke.color
        context.strokeText(word.text, x, y)
      }
      context.fillStyle = word.highlighted ? render.highlightFill : render.fill
      context.fillText(word.text, x, y)
      x += probe.measureText(word.text).width
    })
  })
  return canvas
}

export function captionBitmap(render: CaptionRender): HTMLCanvasElement {
  const key = lookKey(render)
  const cached = cache.get(key)
  if (cached) return cached
  const canvas = rasterise(render)
  if (fontLoaded(render.fontCss)) {
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    cache.set(key, canvas)
  }
  return canvas
}
