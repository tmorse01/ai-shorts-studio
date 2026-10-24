// Text formats for the framing section's number fields (Epic 09, #106). Pure, so the rules are tested
// directly. X and Y are shown as a percentage of the room the crop has to move in (-100% to 100%). The
// zoom is shown as a multiple of the cover crop ("1.00×").

export function formatUnitPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

// "40", "40%" or "-40%" as a fraction of the room. Returns null when the text is not a number.
export function parseUnitPercent(text: string): number | null {
  const cleaned = text.replace('%', '').trim()
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned) / 100
}

export function formatZoom(scale: number): string {
  return `${scale.toFixed(2)}×`
}

// "2", "2.5", "2.5×" or "2.5x". Returns null when the text is not a number.
export function parseZoom(text: string): number | null {
  const cleaned = text.replace(/[×x]/i, '').trim()
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}
