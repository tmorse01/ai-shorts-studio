// The main window's saved bounds and maximised state. Shared so main validates what it writes to
// disk and reads back. Pure, so the rules here are tested directly.
import { z } from 'zod'

export const MIN_WINDOW_WIDTH = 1280
export const MIN_WINDOW_HEIGHT = 720

export const windowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
})

export const windowStateSchema = z.object({
  // The normal (restored) bounds. When the window is maximised these are the size it returns to.
  bounds: windowBoundsSchema,
  maximized: z.boolean()
})
export type WindowState = z.infer<typeof windowStateSchema>
export type WindowBounds = z.infer<typeof windowBoundsSchema>

// How much of the window must sit on a screen for its saved position to be reused.
const MIN_VISIBLE_WIDTH = 120
const MIN_VISIBLE_HEIGHT = 80

function visibleOn(bounds: WindowBounds, area: WindowBounds): boolean {
  const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  const height =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
  return width >= MIN_VISIBLE_WIDTH && height >= MIN_VISIBLE_HEIGHT
}

/**
 * Turns a saved window state into bounds to open with. The size is raised to the editor minimum. A
 * position is kept only when the window would be visible on one of the screens (their work areas);
 * otherwise this returns null, and the window opens centred at its default size.
 */
export function fitWindowState(
  saved: WindowState | null,
  workAreas: WindowBounds[]
): WindowState | null {
  if (!saved) return null
  const bounds: WindowBounds = {
    x: saved.bounds.x,
    y: saved.bounds.y,
    width: Math.max(saved.bounds.width, MIN_WINDOW_WIDTH),
    height: Math.max(saved.bounds.height, MIN_WINDOW_HEIGHT)
  }
  const onScreen = workAreas.some((area) => visibleOn(bounds, area))
  return onScreen ? { bounds, maximized: saved.maximized } : null
}

// The size a window opens at when there is no usable saved state.
export const DEFAULT_WINDOW_SIZE = { width: MIN_WINDOW_WIDTH, height: MIN_WINDOW_HEIGHT }
