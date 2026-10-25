// Timing curves for caption blocks (Epic 11, #119): which word is highlighted at a time, and the scale of
// a block as it pops in. Pure functions of milliseconds, so the preview and export agree.
import type { CaptionBlock } from './captionBlock'

// Length of the pop-in, in ms.
export const POP_IN_MS = 180

// Scale a block starts at, before it settles at 1.
export const POP_IN_START_SCALE = 0.7

// A block is on screen from its first word's start to its last word's end.
export function blockSpanMs(block: CaptionBlock): { startMs: number; endMs: number } {
  const first = block.words[0]
  const last = block.words[block.words.length - 1]
  return { startMs: first?.startMs ?? 0, endMs: last?.endMs ?? 0 }
}

export function isBlockActive(block: CaptionBlock, tMs: number): boolean {
  const { startMs, endMs } = blockSpanMs(block)
  return tMs >= startMs && tMs < endMs
}

// The index of the word being spoken at tMs. A gap between words keeps the previous word lit, so the
// highlight does not flicker off. Returns -1 before the first word starts.
export function highlightIndex(block: CaptionBlock, tMs: number): number {
  let index = -1
  block.words.forEach((word, position) => {
    if (word.startMs <= tMs) index = position
  })
  return index
}

// Scale of a block `elapsedMs` after it appears. It starts at POP_IN_START_SCALE, overshoots slightly
// (an ease-out-back curve), and settles at 1 after POP_IN_MS. Before it starts it is the start scale.
export function popInScale(elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / POP_IN_MS))
  const c1 = 1.70158
  const c3 = c1 + 1
  const eased = 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
  return POP_IN_START_SCALE + (1 - POP_IN_START_SCALE) * eased
}
