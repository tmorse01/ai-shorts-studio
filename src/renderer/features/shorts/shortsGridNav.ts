// Keyboard movement between short cards. Arrow keys move by one card left or right, and by one row
// up or down. The result is clamped to the first and last card, and null means the key is not an
// arrow key.
const STEPS: Partial<Record<string, (columns: number) => number>> = {
  ArrowLeft: () => -1,
  ArrowRight: () => 1,
  ArrowUp: (columns) => -columns,
  ArrowDown: (columns) => columns
}

export function nextCardIndex(
  key: string,
  index: number,
  count: number,
  columns: number
): number | null {
  const step = STEPS[key]
  if (!step || count === 0 || index < 0) return null
  return Math.min(Math.max(index + step(columns), 0), count - 1)
}
