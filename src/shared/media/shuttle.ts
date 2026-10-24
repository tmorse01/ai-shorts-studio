// J/K/L shuttle speeds. Each press in the same direction moves one step up this list.
export const SHUTTLE_SPEEDS = [1, 2, 4, 8] as const

// The playback rate after a J (-1) or L (+1) press. Pressing the same way while playing speeds up;
// any other press starts at 1x in that direction.
export function nextShuttleRate(
  state: { playing: boolean; rate: number },
  direction: 1 | -1
): number {
  const sameDirection = state.playing && Math.sign(state.rate) === direction
  if (!sameDirection) return direction
  const speed = Math.abs(state.rate)
  const index = SHUTTLE_SPEEDS.indexOf(speed as (typeof SHUTTLE_SPEEDS)[number])
  const next = index === -1 ? 1 : SHUTTLE_SPEEDS[Math.min(index + 1, SHUTTLE_SPEEDS.length - 1)]
  return direction * (next ?? 1)
}
