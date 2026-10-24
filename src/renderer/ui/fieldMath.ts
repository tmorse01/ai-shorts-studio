// Pure helpers for the inspector's field controls (Epic 08, #95). No DOM, so the rules are tested
// directly: drag scaling, timecode and dB parsing, and the mixed-value display.

// Frames per second used by the mm:ss.ff field. Matches the editor's frame rate.
const FIELD_FRAME_RATE = 30

// Shift makes a drag 10x finer; Ctrl makes it 10x coarser.
export function dragMultiplier(modifiers: { shift: boolean; ctrl: boolean }): number {
  if (modifiers.shift) return 0.1
  if (modifiers.ctrl) return 10
  return 1
}

// The value after dragging dragPx pixels from startValue. The result snaps to step.
export function scrubValue(
  startValue: number,
  dragPx: number,
  step: number,
  modifiers: { shift: boolean; ctrl: boolean }
): number {
  const raw = startValue + dragPx * step * dragMultiplier(modifiers)
  return Math.round(raw / step) * step
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// "mm:ss.ff", where ff is the frame within the second (0 to 29). Returns null for anything else.
export function parseFieldTimecode(text: string): number | null {
  const match = /^(\d+):([0-5]\d)\.(\d{1,2})$/.exec(text.trim())
  if (!match) return null
  const frames = Number(match[3])
  if (frames >= FIELD_FRAME_RATE) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return Math.round((seconds * FIELD_FRAME_RATE + frames) * (1000 / FIELD_FRAME_RATE))
}

export function formatFieldTimecode(ms: number): string {
  const totalFrames = Math.floor((Math.max(ms, 0) * FIELD_FRAME_RATE) / 1000)
  const frames = totalFrames % FIELD_FRAME_RATE
  const totalSeconds = Math.floor(totalFrames / FIELD_FRAME_RATE)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(minutes)}:${pad(seconds)}.${pad(frames)}`
}

// "-6", "-6.5", or "-6 dB". Returns null when the text is not a number.
export function parseDb(text: string): number | null {
  const cleaned = text.replace(/dB/i, '').trim()
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

export function formatDb(db: number): string {
  return `${db.toFixed(1)} dB`
}

// The quietest dB value the volume field shows. Gain at or below it reads as this value.
export const SILENT_DB = -60

// Linear gain to dB. Gain 0 (silence) reads as SILENT_DB.
export function gainToDb(gain: number): number {
  if (gain <= 0) return SILENT_DB
  return Math.max(SILENT_DB, 20 * Math.log10(gain))
}

// dB to linear gain. SILENT_DB and below is silence (0).
export function dbToGain(db: number): number {
  if (db <= SILENT_DB) return 0
  return 10 ** (db / 20)
}

// The text shown when a field covers several selected items. Equal values show normally, any
// difference shows an em dash, and no items shows nothing.
export const MIXED_VALUE = '—'

export function displayValue<T>(values: readonly T[], format: (value: T) => string): string {
  if (values.length === 0) return ''
  const first = values[0]
  return values.every((value) => value === first) ? format(first) : MIXED_VALUE
}
