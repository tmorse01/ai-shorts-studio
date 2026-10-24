// In and Out marks on the source being viewed. Pure, so the rules are tested without the DOM.
// A mark that would make the range empty or reversed removes the other mark, so the newest mark wins.

export interface SourceMarks {
  inMs: number | null
  outMs: number | null
}

export const NO_MARKS: SourceMarks = { inMs: null, outMs: null }

function clampMs(ms: number, durationMs: number): number {
  return Math.min(Math.max(ms, 0), Math.max(durationMs, 0))
}

export function markIn(marks: SourceMarks, ms: number, durationMs: number): SourceMarks {
  const inMs = clampMs(ms, durationMs)
  const outMs = marks.outMs !== null && marks.outMs > inMs ? marks.outMs : null
  return { inMs, outMs }
}

export function markOut(marks: SourceMarks, ms: number, durationMs: number): SourceMarks {
  const outMs = clampMs(ms, durationMs)
  const inMs = marks.inMs !== null && marks.inMs < outMs ? marks.inMs : null
  return { inMs, outMs }
}

// The marked range, or null unless both marks are set.
export function markedRange(marks: SourceMarks): { startMs: number; endMs: number } | null {
  if (marks.inMs === null || marks.outMs === null) return null
  return { startMs: marks.inMs, endMs: marks.outMs }
}

// Where a range sits along the scrub bar, as percentages of the duration.
export function rangePercent(
  range: { startMs: number; endMs: number },
  durationMs: number
): { left: number; width: number } {
  if (durationMs <= 0) return { left: 0, width: 0 }
  const left = (clampMs(range.startMs, durationMs) / durationMs) * 100
  const right = (clampMs(range.endMs, durationMs) / durationMs) * 100
  return { left, width: Math.max(right - left, 0) }
}
