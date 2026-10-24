// Pure sizing rules for the editor panes. Kept free of React so the limits can be tested directly.
import type { PaneId } from '@shared/layout'

/** Pixel limits for each resizable pane. */
export const PANE_LIMITS: Record<PaneId, { min: number; max: number }> = {
  left: { min: 200, max: 520 },
  right: { min: 240, max: 520 },
  bottom: { min: 160, max: 480 }
}

/** The centre canvas keeps at least this many pixels along the pane's axis. */
const CENTER_MIN: Record<PaneId, number> = { left: 480, right: 480, bottom: 240 }

/** Width of a collapsed pane's strip, in px. */
export const COLLAPSED_STRIP_SIZE = 32

/** How far one arrow-key press moves a pane edge, in px. */
export const KEY_RESIZE_STEP = 16

/** Below this window width the side panes collapse. The window's minimum is 1280px. */
export const NARROW_BREAKPOINT = 1440

export const NARROW_QUERY = `(max-width: ${NARROW_BREAKPOINT - 1}px)`

export function isNarrowWidth(width: number): boolean {
  return width < NARROW_BREAKPOINT
}

/**
 * Keeps a requested pane size inside its limits and leaves the centre canvas its minimum.
 * `extent` is the window size along the pane's axis (width for left and right, height for bottom).
 * The pane's own minimum wins if the window is too small to honour both.
 */
export function clampPaneSize(pane: PaneId, size: number, extent: number): number {
  const { min, max } = PANE_LIMITS[pane]
  const upper = Math.max(min, Math.min(max, extent - CENTER_MIN[pane]))
  return Math.round(Math.min(Math.max(size, min), upper))
}
