// Rasterises a text overlay onto a 2D canvas (Epic 13, #126). The layout comes from the pure description
// in @shared/text/textRender; this file only draws it. Bitmaps are cached by their look, not their
// position, so an unchanged text item is drawn once. A bitmap is kept only once its font has loaded, so a
// fallback face is never cached.
import type { TextRender } from '@shared/text/textRender'

const CACHE_LIMIT = 48
const cache = new Map<string, HTMLCanvasElement>()

function lookKey(render: TextRender): string {
  return JSON.stringify([
    render.lines,
    render.fontCss,
    render.letterSpacingPx,
    render.lineHeightPx,
    render.fill,
    render.stroke
  ])
}

// True when the font is loaded. Otherwise it starts loading, and the caller draws with the fallback.
function fontLoaded(fontCss: string): boolean {
  if (!document.fonts) return true
  if (document.fonts.check(fontCss)) return true
  void document.fonts.load(fontCss)
  return false
}

function rasterise(render: TextRender): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const probe = canvas.getContext('2d')
  if (!probe) return canvas
  const pad = render.stroke ? Math.ceil(render.stroke.widthPx) : 0
  probe.font = render.fontCss
  probe.letterSpacing = `${render.letterSpacingPx}px`
  const widest = Math.max(0, ...render.lines.map((line) => probe.measureText(line).width))
  // Setting the size clears the context state, so the drawing settings are set again below.
  canvas.width = Math.max(1, Math.ceil(widest + pad * 2))
  canvas.height = Math.max(1, Math.ceil(render.lineHeightPx * render.lines.length + pad * 2))
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.font = render.fontCss
  context.letterSpacing = `${render.letterSpacingPx}px`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  const x = canvas.width / 2
  render.lines.forEach((line, index) => {
    const y = pad + render.lineHeightPx * (index + 0.5)
    if (render.stroke) {
      // The stroke is centred on the outline, so double its width to show widthPx outside it.
      context.lineWidth = render.stroke.widthPx * 2
      context.strokeStyle = render.stroke.color
      context.strokeText(line, x, y)
    }
    context.fillStyle = render.fill
    context.fillText(line, x, y)
  })
  return canvas
}

export function textBitmap(render: TextRender): HTMLCanvasElement {
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
