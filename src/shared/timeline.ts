export interface Segment {
  startSec: number
  endSec: number
}

export interface Caption {
  startSec: number
  endSec: number
  text: string
}

export type Ratio = 'original' | '16:9' | '9:16' | '1:1'

export interface Framing {
  /** 0..1, where the crop window sits horizontally inside the source (0.5 = centred). */
  x: number
  /** 0..1, vertical position. */
  y: number
  /** 'crop' fills the frame, 'fit' letterboxes with black bars. */
  mode: 'crop' | 'fit'
}

export const MIN_SEGMENT_SEC = 0.5
export const MIN_SHORT_SEC = 10
export const MAX_SHORT_SEC = 90
export const MAX_SEGMENTS_PER_SHORT = 6

export function segmentsDuration(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0)
}

/**
 * A cut as it sits on a short's timeline. `startSec`/`endSec` are the footage it plays; `atSec` is where it
 * starts on the timeline. Cuts keep their place, so trimming one never moves another. Blank space between
 * cuts is allowed, and plays as black with silence.
 */
export interface TimelineCut extends Segment {
  atSec: number
}

export const cutLength = (c: Segment): number => c.endSec - c.startSec
export const cutEnd = (c: TimelineCut): number => c.atSec + cutLength(c)

/** Place cuts one after another from zero. Used for shorts saved before cuts had a place of their own. */
export function placeBackToBack(segments: Segment[]): TimelineCut[] {
  let at = 0
  return segments.map((s) => {
    const cut = { startSec: s.startSec, endSec: s.endSec, atSec: at }
    at += cutLength(s)
    return cut
  })
}

/** Length a short gets when it has none saved: its cuts end-to-end, kept inside the allowed range. */
export function defaultLengthSec(cuts: Segment[]): number {
  return Math.min(MAX_SHORT_SEC, Math.max(MIN_SHORT_SEC, segmentsDuration(cuts)))
}

/**
 * Keep cuts inside the timeline: clamp them to [0, lengthSec], drop slivers, and put them in placement order.
 * Where two cuts would overlap on the timeline, the later one starts where the earlier one ends, and is
 * shortened from its end to fit. Cuts pushed past the end are dropped. Pure: never mutates input.
 */
export function tidyCuts(cuts: TimelineCut[], lengthSec: number): TimelineCut[] {
  const sorted = cuts
    .map((c) => ({ ...c, atSec: Math.max(0, c.atSec) }))
    .filter((c) => c.atSec < lengthSec && cutLength(c) >= MIN_SEGMENT_SEC)
    .sort((a, b) => a.atSec - b.atSec)
  const out: TimelineCut[] = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    let cut = c
    if (prev && cut.atSec < cutEnd(prev)) {
      const shift = cutEnd(prev) - cut.atSec
      cut = { ...cut, atSec: cutEnd(prev), startSec: cut.startSec + shift }
    }
    const fitLength = Math.min(cutLength(cut), lengthSec - cut.atSec, cut.endSec - cut.startSec)
    if (fitLength < MIN_SEGMENT_SEC) continue
    out.push({ ...cut, endSec: cut.startSec + fitLength })
  }
  return out
}

/** Every cut must be within the timeline, and no two may overlap. Returns a message for the first problem. */
export function validateCuts(cuts: TimelineCut[], lengthSec: number): string | null {
  if (cuts.length === 0) return 'A short needs at least one cut.'
  if (cuts.length > MAX_SEGMENTS_PER_SHORT) return `A short can use at most ${MAX_SEGMENTS_PER_SHORT} cuts.`
  if (lengthSec < MIN_SHORT_SEC) return `Shorts must be at least ${MIN_SHORT_SEC}s long.`
  if (lengthSec > MAX_SHORT_SEC) return `Shorts must be at most ${MAX_SHORT_SEC}s long.`
  const sorted = [...cuts].sort((a, b) => a.atSec - b.atSec)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].atSec < 0 || cutEnd(sorted[i]) > lengthSec + 1e-6) return 'A cut sits outside the short.'
    if (i > 0 && sorted[i].atSec < cutEnd(sorted[i - 1]) - 1e-6) return 'Two cuts overlap.'
  }
  return null
}

/**
 * Clamp segments to [0, duration], drop slivers, sort, and merge overlaps.
 * Pure: never mutates input.
 */
export function normalizeSegments(segments: Segment[], durationSec: number): Segment[] {
  const clamped = segments
    .map((s) => ({
      startSec: Math.max(0, Math.min(s.startSec, durationSec)),
      endSec: Math.max(0, Math.min(s.endSec, durationSec))
    }))
    .filter((s) => s.endSec - s.startSec >= MIN_SEGMENT_SEC)
    .sort((a, b) => a.startSec - b.startSec)

  const merged: Segment[] = []
  for (const s of clamped) {
    const last = merged[merged.length - 1]
    if (last && s.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, s.endSec)
    } else {
      merged.push({ ...s })
    }
  }
  return merged
}

export interface Candidate extends Segment {
  rank: number
}

/**
 * Drop candidates that overlap an already-kept, higher-ranked one by more than `maxOverlap`
 * (a fraction of the shorter interval). Input is assumed sorted by rank ascending.
 */
export function dedupeCandidates<T extends Candidate>(items: T[], maxOverlap = 0.5): T[] {
  const kept: T[] = []
  for (const item of items) {
    const duplicate = kept.some((k) => {
      const overlap = Math.min(k.endSec, item.endSec) - Math.max(k.startSec, item.startSec)
      if (overlap <= 0) return false
      const shorter = Math.min(k.endSec - k.startSec, item.endSec - item.startSec)
      return shorter > 0 && overlap / shorter > maxOverlap
    })
    if (!duplicate) kept.push(item)
  }
  return kept
}

export interface Size {
  width: number
  height: number
}

const RATIO_SIZE: Record<Exclude<Ratio, 'original'>, Size> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 }
}

/**
 * Output frame size for a ratio. `shortSide` sets the shorter edge of the frame (1080 by default).
 * `original` keeps the source size, rounded down to even numbers, and ignores `shortSide`.
 */
export function outputSize(ratio: Ratio, source: Size, shortSide = 1080): Size {
  if (ratio === 'original') {
    return { width: even(source.width), height: even(source.height) }
  }
  const base = RATIO_SIZE[ratio]
  if (shortSide === 1080) return base
  const scale = shortSide / Math.min(base.width, base.height)
  return { width: even(base.width * scale), height: even(base.height * scale) }
}

const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2)

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Compute the source rectangle to keep for a ratio. In `crop` mode the largest rectangle with the
 * target aspect is cut from the source and positioned with normalized framing (x/y).
 * Returns null for `fit` mode or `original`, which need no crop.
 */
export function cropRect(source: Size, ratio: Ratio, framing: Framing): CropRect | null {
  if (ratio === 'original' || framing.mode === 'fit') return null
  const target = outputSize(ratio, source)
  const targetAspect = target.width / target.height
  const sourceAspect = source.width / source.height

  let width: number
  let height: number
  if (sourceAspect > targetAspect) {
    height = source.height
    width = Math.round(height * targetAspect)
  } else {
    width = source.width
    height = Math.round(width / targetAspect)
  }
  width = evenFloor(width)
  height = evenFloor(height)

  const x = Math.round((source.width - width) * clamp01(framing.x))
  const y = Math.round((source.height - height) * clamp01(framing.y))
  return { x: evenFloor(x), y: evenFloor(y), width, height }
}

/** Round down to an even number without the minimum of 2 used for frame sizes. */
const evenFloor = (n: number): number => Math.floor(n / 2) * 2

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5))

/**
 * Remap caption times from source timeline onto the concatenated output timeline produced by the
 * segments, dropping captions that fall outside every kept segment and clipping those that straddle a cut.
 */
export function remapCaptions(captions: Caption[], cuts: TimelineCut[]): Caption[] {
  const out: Caption[] = []
  for (const cut of cuts) {
    for (const c of captions) {
      const start = Math.max(c.startSec, cut.startSec)
      const end = Math.min(c.endSec, cut.endSec)
      if (end - start <= 0.05) continue
      out.push({
        startSec: round3(cut.atSec + (start - cut.startSec)),
        endSec: round3(cut.atSec + (end - cut.startSec)),
        text: c.text
      })
    }
  }
  return out.sort((a, b) => a.startSec - b.startSec)
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

export function formatAssTime(sec: number): string {
  const total = Math.max(0, sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const cs = Math.round((s - Math.floor(s)) * 100)
  const whole = Math.floor(s)
  return `${h}:${pad2(m)}:${pad2(whole)}.${pad2(cs === 100 ? 99 : cs)}`
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export interface CaptionStyle {
  fontSize: number
  /** Distance from the bottom edge, in output pixels. */
  marginV: number
}

/** Escape user text for an ASS dialogue line. */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/[{}]/g, '')
    .replace(/\r?\n/g, '\\N')
}

export function buildAss(captions: Caption[], size: Size, style: CaptionStyle): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${size.width}`,
    `PlayResY: ${size.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${style.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,80,80,${style.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const lines = captions.map(
    (c) =>
      `Dialogue: 0,${formatAssTime(c.startSec)},${formatAssTime(c.endSec)},Default,,0,0,0,,${escapeAssText(c.text)}`
  )
  return [...header, ...lines, ''].join('\n')
}
