// Caption placement and the render description of caption blocks (Epic 11, #119). Words wrap and sit in
// the lower third of the canvas, kept inside the safe zone by default. Pure: the preview draws the result
// and export can burn in the same output. Widths are estimated from the font size, as the text overlay
// does, so every consumer wraps the same way.
import type { Timeline } from '../timeline/timeline'
import type { SafeZoneInsets } from '../preview/previewView'
import { TEXT_FONT_STACKS, TEXT_PALETTE } from '../text/textStyles'
import type { CaptionBlock } from './captionBlock'
import { resolveCaptionPreset, type CaptionPreset } from './captionPreset'
import { blockSpanMs, highlightIndex, isBlockActive, popInScale } from './captionTiming'

// Where a caption sits when nothing else pulls it: 72% down the frame, the lower third.
export const CAPTION_ANCHOR_Y = 0.72

// The insets used when a short has safe zones on. They match the generic platform insets in
// preview/previewView.ts, restated here so this module needs no runtime import from it (no cycle).
export const CAPTION_SAFE_INSETS: SafeZoneInsets = {
  left: 0.05,
  right: 0.05,
  top: 0.1,
  bottom: 0.1
}

// Average glyph width as a fraction of the font size (the estimate the text overlay uses).
const MIXED_CASE_EM = 0.55
const UPPER_CASE_EM = 0.66
// The widest a caption line runs, as a fraction of the frame width, when safe zones are off.
const UNSAFE_MAX_LINE_FRACTION = 0.9

export interface CaptionWordRender {
  text: string
  highlighted: boolean
}

export interface CaptionRender {
  // Lines to draw, top to bottom. Each word knows whether it is the one being spoken.
  lines: CaptionWordRender[][]
  fontCss: string
  fontSizePx: number
  lineHeightPx: number
  letterSpacingPx: number
  fill: string
  highlightFill: string
  stroke: { color: string; widthPx: number } | null
  // Centre of the caption block in canvas pixels, from the top-left corner.
  centerX: number
  centerY: number
  // Scale from the pop-in animation. 1 once it has settled.
  scale: number
}

export interface CaptionOptions {
  presets: readonly CaptionPreset[]
  // The short's default preset id.
  shortPresetId?: string
  // Safe zones are on by default, so captions stay clear of platform UI.
  safeZones: boolean
  // The insets to respect when safeZones is on. Defaults to CAPTION_SAFE_INSETS.
  insets?: SafeZoneInsets
}

// Groups word indexes into lines no wider than maxChars characters, greedily. A word longer than a line
// gets a line to itself.
export function wrapWordIndexes(lengths: readonly number[], maxChars: number): number[][] {
  const lines: number[][] = []
  let current: number[] = []
  let width = 0
  lengths.forEach((length, index) => {
    const next = current.length === 0 ? length : width + 1 + length
    if (current.length > 0 && next > maxChars) {
      lines.push(current)
      current = [index]
      width = length
    } else {
      current.push(index)
      width = next
    }
  })
  if (current.length > 0) lines.push(current)
  return lines
}

// The vertical centre for a caption box of boxHeight. It aims at the anchor, then is pulled inside the
// safe band when safe zones are on. A box taller than the band is centred in the band.
export function captionCenterY(
  canvasHeight: number,
  boxHeight: number,
  insets: SafeZoneInsets | null
): number {
  const anchor = canvasHeight * CAPTION_ANCHOR_Y
  if (!insets) return anchor
  const top = canvasHeight * insets.top
  const bottom = canvasHeight * (1 - insets.bottom)
  if (bottom - top <= boxHeight) return (top + bottom) / 2
  const minCentre = top + boxHeight / 2
  const maxCentre = bottom - boxHeight / 2
  return Math.min(maxCentre, Math.max(minCentre, anchor))
}

// The render description of one caption block at tMs, with the look of the given preset.
export function describeCaptionBlock(
  block: CaptionBlock,
  tMs: number,
  preset: CaptionPreset,
  canvas: { width: number; height: number },
  options: { safeZones: boolean; insets?: SafeZoneInsets }
): CaptionRender {
  const sizePx = preset.sizePx
  const em = preset.uppercase ? UPPER_CASE_EM : MIXED_CASE_EM
  const charWidthPx = sizePx * em + preset.letterSpacingPx
  const insets = options.safeZones ? (options.insets ?? CAPTION_SAFE_INSETS) : null
  const widthFraction = insets ? 1 - insets.left - insets.right : UNSAFE_MAX_LINE_FRACTION
  const maxChars = Math.max(1, Math.floor((canvas.width * widthFraction) / charWidthPx))
  const texts = block.words.map((word) => (preset.uppercase ? word.text.toUpperCase() : word.text))
  const highlighted = preset.highlightWords ? highlightIndex(block, tMs) : -1
  const lines = wrapWordIndexes(
    texts.map((text) => text.length),
    maxChars
  ).map((indexes) =>
    indexes.map((index) => ({ text: texts[index] ?? '', highlighted: index === highlighted }))
  )
  const lineHeightPx = Math.round(sizePx * 1.15)
  const { startMs } = blockSpanMs(block)
  return {
    lines,
    fontCss: `${preset.weight} ${sizePx}px ${TEXT_FONT_STACKS[preset.font]}`,
    fontSizePx: sizePx,
    lineHeightPx,
    letterSpacingPx: preset.letterSpacingPx,
    fill: TEXT_PALETTE[preset.fill],
    highlightFill: TEXT_PALETTE[preset.highlight],
    stroke: preset.stroke
      ? { color: TEXT_PALETTE[preset.stroke.color], widthPx: preset.stroke.widthPx }
      : null,
    centerX: canvas.width / 2,
    centerY: captionCenterY(canvas.height, lineHeightPx * lines.length, insets),
    scale: preset.popIn ? popInScale(tMs - startMs) : 1
  }
}

// A caption block on screen at tMs, with the track it sits on and its description.
export interface ActiveCaption {
  trackId: string
  block: CaptionBlock
  render: CaptionRender
}

// Every caption block on a captions track that is on screen at tMs, in track order.
export function describeCaptions(
  timeline: Timeline,
  tMs: number,
  canvas: { width: number; height: number },
  options: CaptionOptions
): ActiveCaption[] {
  const active: ActiveCaption[] = []
  for (const track of timeline.tracks) {
    if (track.role !== 'captions') continue
    for (const block of track.captions ?? []) {
      if (!isBlockActive(block, tMs)) continue
      const preset = resolveCaptionPreset(options.presets, options.shortPresetId, block.styleId)
      const render = describeCaptionBlock(block, tMs, preset, canvas, options)
      active.push({ trackId: track.id, block, render })
    }
  }
  return active
}
