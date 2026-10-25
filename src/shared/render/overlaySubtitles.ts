// The ASS script for text overlays and captions in an export (Epic 17, #150). Each frame is described by
// describeFrame, the same description the preview draws, and each text or caption layer in it becomes ASS
// dialogue: its position, size, colour, fade and scale at that moment. libass draws the text in ffmpeg, so
// the export needs no canvas or browser. Consecutive frames that read the same are merged into one event.
// Pure: it returns text and runs nothing. Font matching is libass's, not the preview's canvas.
import { CANVAS_HEIGHT, CANVAS_WIDTH, describeFrame, type SourceSize } from '../compositor/frame'
import type { CaptionRender } from '../captions/captionLayout'
import type { TextRender } from '../text/textRender'
import { timelineDurationMs } from '../timeline/resolveFrame'
import type { Timeline } from '../timeline/timeline'
import { planOverlays } from './overlayPlan'

export interface SubtitleOptions {
  fps: number
  sizeOf?: (mediaId: string) => SourceSize | null
}

// The ASS header. The script is at the canvas size, so its coordinates are canvas pixels. Plain draws a
// text outline (BorderStyle 1). Box draws an opaque box behind the text (BorderStyle 3), using the outline
// colour and width as the box's colour and padding.
const HEADER = [
  '[Script Info]',
  'ScriptType: v4.00+',
  `PlayResX: ${CANVAS_WIDTH}`,
  `PlayResY: ${CANVAS_HEIGHT}`,
  'WrapStyle: 2',
  'ScaledBorderAndShadow: yes',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Plain,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
  'Style: Box,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,0,0,5,0,0,0,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
]

// One drawn event: the style it uses and its override tags and text.
interface Body {
  style: 'Plain' | 'Box'
  text: string
}

// A stretch of frames over which one layer reads the same.
interface Run extends Body {
  key: string
  startMs: number
  endMs: number
}

// A number for an ASS tag: at most two decimals, never exponent form.
function fmt(value: number): string {
  const fixed = Number(value.toFixed(2))
  return String(fixed === 0 ? 0 : fixed)
}

// A #RRGGBB palette colour as an ASS colour, &HBBGGRR&.
function assColour(hex: string): string {
  const rgb = hex.replace('#', '')
  const red = rgb.slice(0, 2)
  const green = rgb.slice(2, 4)
  const blue = rgb.slice(4, 6)
  return `&H${blue}${green}${red}&`.toUpperCase()
}

// ASS alpha is 00 for solid and FF for invisible. Our opacity runs the other way.
function assAlpha(opacity: number): string {
  const clamped = Math.min(Math.max(opacity, 0), 1)
  const byte = Math.round((1 - clamped) * 255)
  return `&H${byte.toString(16).padStart(2, '0').toUpperCase()}&`
}

// Text as ASS: braces and backslashes would start a tag, so they are replaced by look-alike characters.
function assText(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\\/g, '/')
}

// The family and weight from a CSS font shorthand such as "600 64px 'Inter Variable', system-ui".
export function parseFontCss(fontCss: string): { family: string; bold: boolean } {
  const match = /^(\d+)\s+[\d.]+px\s+(.*)$/.exec(fontCss)
  const weight = match?.[1] ? Number(match[1]) : 400
  const stack = match?.[2] ?? fontCss
  const family = (stack.split(',')[0] ?? 'Arial').trim().replace(/^['"]|['"]$/g, '')
  return { family: family || 'Arial', bold: weight >= 600 }
}

// The override tags every drawn layer shares: where it is, its font and size, its scale and opacity.
function commonTags(options: {
  centreX: number
  centreY: number
  fontCss: string
  fontSizePx: number
  letterSpacingPx: number
  scale: number
  opacity: number
  fill: string
}): string[] {
  const font = parseFontCss(options.fontCss)
  return [
    '\\an5',
    `\\pos(${fmt(options.centreX)},${fmt(options.centreY)})`,
    `\\fn${font.family}`,
    `\\fs${fmt(options.fontSizePx)}`,
    `\\b${font.bold ? 1 : 0}`,
    `\\fsp${fmt(options.letterSpacingPx)}`,
    `\\fscx${fmt(options.scale * 100)}`,
    `\\fscy${fmt(options.scale * 100)}`,
    `\\alpha${assAlpha(options.opacity)}`,
    `\\1c${assColour(options.fill)}`,
    '\\shad0'
  ]
}

// A text overlay as one dialogue body. Its box (or outline) comes from the description, scaled by its motion.
export function textBody(text: TextRender): Body {
  const outline = text.backdrop
    ? { colour: text.backdrop.color, widthPx: text.padPx }
    : text.stroke
      ? { colour: text.stroke.color, widthPx: text.stroke.widthPx }
      : { colour: '#000000', widthPx: 0 }
  const tags = [
    ...commonTags({
      centreX: text.centerX,
      centreY: text.centerY,
      fontCss: text.fontCss,
      fontSizePx: text.fontSizePx,
      letterSpacingPx: text.letterSpacingPx,
      scale: text.motionScale,
      opacity: text.alpha,
      fill: text.fill
    }),
    `\\bord${fmt(outline.widthPx)}`,
    `\\3c${assColour(outline.colour)}`
  ]
  const lines = text.lines.map(assText).join('\\N')
  return { style: text.backdrop ? 'Box' : 'Plain', text: `{${tags.join('')}}${lines}` }
}

// A caption block as one dialogue body. The spoken word takes the highlight colour, as the preview draws it.
export function captionBody(caption: CaptionRender): Body {
  const outline = caption.stroke ?? { color: '#000000', widthPx: 0 }
  const tags = [
    ...commonTags({
      centreX: caption.centerX,
      centreY: caption.centerY,
      fontCss: caption.fontCss,
      fontSizePx: caption.fontSizePx,
      letterSpacingPx: caption.letterSpacingPx,
      scale: caption.scale,
      opacity: 1,
      fill: caption.fill
    }),
    `\\bord${fmt(outline.widthPx)}`,
    `\\3c${assColour(outline.color)}`
  ]
  const lines = caption.lines.map((words) =>
    words
      .map((word) => {
        const text = assText(word.text)
        return word.highlighted
          ? `{\\1c${assColour(caption.highlightFill)}}${text}{\\1c${assColour(caption.fill)}}`
          : text
      })
      .join(' ')
  )
  return { style: 'Plain', text: `{${tags.join('')}}${lines.join('\\N')}` }
}

// An ASS time, h:mm:ss.cc with centiseconds.
export function assTime(ms: number): string {
  const centiseconds = Math.round(ms / 10)
  const cs = centiseconds % 100
  const totalSeconds = Math.floor(centiseconds / 100)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// The ASS script for every text overlay and caption block in the timeline, or null when there is none.
// The script is at the canvas size. A caller writes it to disk and passes its path to the graph.
export function buildOverlaySubtitles(timeline: Timeline, options: SubtitleOptions): string | null {
  const keys = new Set(
    planOverlays(timeline)
      .filter((entry) => entry.kind === 'ass')
      .map((entry) => entry.key)
  )
  if (keys.size === 0) return null
  const sizeOf = options.sizeOf ?? (() => null)
  const durationMs = timelineDurationMs(timeline)
  const stepMs = 1000 / options.fps
  const runs: Run[] = []
  const open = new Map<string, Run>()
  for (let index = 0; index * stepMs < durationMs; index += 1) {
    const startMs = index * stepMs
    const endMs = Math.min(durationMs, startMs + stepMs)
    const seen = new Set<string>()
    for (const layer of describeFrame(timeline, startMs, sizeOf).layers) {
      if (!keys.has(layer.clipId)) continue
      const body = layer.text
        ? textBody(layer.text)
        : layer.captions
          ? captionBody(layer.captions)
          : null
      if (!body) continue
      seen.add(layer.clipId)
      const run = open.get(layer.clipId)
      if (run && run.style === body.style && run.text === body.text) {
        run.endMs = endMs
        continue
      }
      if (run) runs.push(run)
      open.set(layer.clipId, { key: layer.clipId, startMs, endMs, ...body })
    }
    for (const [key, run] of open) {
      if (seen.has(key)) continue
      runs.push(run)
      open.delete(key)
    }
  }
  runs.push(...open.values())
  const events = runs
    .filter((run) => assTime(run.endMs) !== assTime(run.startMs))
    .sort((a, b) => a.startMs - b.startMs)
    .map(
      (run) =>
        `Dialogue: 0,${assTime(run.startMs)},${assTime(run.endMs)},${run.style},,0,0,0,,${run.text}`
    )
  if (events.length === 0) return null
  return [...HEADER, ...events, ''].join('\n')
}
