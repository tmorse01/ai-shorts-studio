// The render description for one text overlay at one frame (Epic 13, #126). Pure: no DOM, no store.
// The preview rasterises it with a 2D canvas, and export (Epic 17) can draw the same description. Line
// breaks are estimated from the font size, not measured, so every consumer wraps text the same way.
import { TEXT_PALETTE, TEXT_STYLES, TEXT_FONT_STACKS } from './textStyles'
import type { TextItem, TextMotion } from './textItem'

// The length of a fade-in or fade-out, in ms. A clip shorter than twice this fades for half its length.
export const TEXT_FADE_MS = 250

// The widest a line may run, as a fraction of the frame width.
const MAX_LINE_FRACTION = 0.84

// Average glyph width as a fraction of the font size. Upper case is wider. These are estimates only.
const MIXED_CASE_EM = 0.55
const UPPER_CASE_EM = 0.66

export interface TextRender {
  // The lines to draw, top to bottom, already upper-cased where the style asks.
  lines: string[]
  // A CSS font shorthand, for example "600 64px 'Inter Variable', system-ui, sans-serif".
  fontCss: string
  fontSizePx: number
  lineHeightPx: number
  letterSpacingPx: number
  // A hex colour from the palette.
  fill: string
  stroke: { color: string; widthPx: number } | null
  // A box drawn behind the text, or null for none. The box covers the text block plus padPx on each side.
  backdrop: { color: string } | null
  // Space around the text block for its stroke or backdrop, in canvas pixels.
  padPx: number
  // The size of the text block with its padding, in canvas pixels. It is estimated from the font size, the
  // same way the lines are wrapped, so the canvas gizmo's box matches what the bitmap draws closely.
  boxWidthPx: number
  boxHeightPx: number
  // Centre of the text block in canvas pixels, measured from the top-left corner.
  centerX: number
  centerY: number
  // Opacity from 0 to 1 for the item's enter and exit motion.
  alpha: number
}

export interface CanvasSize {
  width: number
  height: number
}

// The opacity of an item at elapsedMs into its clip of durationMs, from its enter and exit motion.
export function textMotionAlpha(
  motion: { enter?: TextMotion; exit?: TextMotion },
  elapsedMs: number,
  durationMs: number
): number {
  const fadeMs = Math.min(TEXT_FADE_MS, durationMs / 2)
  if (fadeMs <= 0) return 1
  let alpha = 1
  if (motion.enter === 'fade' && elapsedMs < fadeMs) {
    alpha = Math.min(alpha, Math.max(0, elapsedMs) / fadeMs)
  }
  const remainingMs = durationMs - elapsedMs
  if (motion.exit === 'fade' && remainingMs < fadeMs) {
    alpha = Math.min(alpha, Math.max(0, remainingMs) / fadeMs)
  }
  return alpha
}

// Greedy word wrap. Explicit line breaks are kept. A single word wider than the line stays whole.
export function wrapLines(text: string, maxWidthPx: number, charWidthPx: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidthPx / charWidthPx))
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
      if (current === '') {
        current = word
      } else if (current.length + 1 + word.length <= maxChars) {
        current = `${current} ${word}`
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current !== '') lines.push(current)
  }
  return lines
}

// Describes one text item at elapsedMs into its clip. Returns null when there is nothing to draw.
export function describeText(
  item: TextItem,
  elapsedMs: number,
  durationMs: number,
  canvas: CanvasSize
): TextRender | null {
  const style = TEXT_STYLES[item.styleId]
  if (item.text.trim() === '') return null
  const sizePx = style.sizePx * item.scale
  const letterSpacingPx = style.letterSpacingPx * item.scale
  const em = style.uppercase ? UPPER_CASE_EM : MIXED_CASE_EM
  const charWidthPx = sizePx * em + letterSpacingPx
  const source = style.uppercase ? item.text.toUpperCase() : item.text
  const lines = wrapLines(source, canvas.width * MAX_LINE_FRACTION, charWidthPx)
  const stroke = style.stroke
    ? {
        color: TEXT_PALETTE[style.stroke.color],
        widthPx: style.stroke.widthPx * item.scale
      }
    : null
  const backdrop = item.backdrop ? { color: TEXT_PALETTE[item.backdrop] } : null
  // A backdrop needs room around the text, a fifth of the font size. A stroke needs its width.
  const backdropPadPx = backdrop ? Math.round(sizePx * 0.2) : 0
  const padPx = Math.max(stroke ? Math.ceil(stroke.widthPx) : 0, backdropPadPx)
  const widestChars = Math.max(...lines.map((line) => line.length))
  const lineHeightPx = Math.round(sizePx * 1.15)
  return {
    lines,
    fontCss: `${style.weight} ${sizePx}px ${TEXT_FONT_STACKS[style.font]}`,
    fontSizePx: sizePx,
    lineHeightPx,
    letterSpacingPx,
    fill: TEXT_PALETTE[item.color ?? style.fill],
    stroke,
    backdrop,
    padPx,
    boxWidthPx: widestChars * charWidthPx + padPx * 2,
    boxHeightPx: lines.length * lineHeightPx + padPx * 2,
    centerX: item.x * canvas.width,
    centerY: item.y * canvas.height,
    alpha: textMotionAlpha(item, elapsedMs, durationMs)
  }
}
