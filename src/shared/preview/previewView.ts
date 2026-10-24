// Pure geometry for the preview's view controls (Epic 06, #81): safe-zone insets per platform, the
// zoom modes, and panning at 100%. Sizes are CSS pixels of the preview frame. No DOM, no store.
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../compositor/frame'
import type { ShortPlatform } from '../project/schema'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

// Distances from each edge of the frame, as fractions of its size (0 to 1).
export interface SafeZoneInsets {
  left: number
  right: number
  top: number
  bottom: number
}

// Guide areas for each platform's on-screen UI (captions, buttons, the username and sound line).
// Rounded from common platform guidance; the owner can tune them here in one place.
export const SAFE_ZONE_INSETS: Record<ShortPlatform, SafeZoneInsets> = {
  generic: { left: 0.05, right: 0.05, top: 0.1, bottom: 0.1 },
  youtube: { left: 0.05, right: 0.12, top: 0.08, bottom: 0.2 },
  tiktok: { left: 0.05, right: 0.12, top: 0.06, bottom: 0.2 },
  reels: { left: 0.06, right: 0.06, top: 0.14, bottom: 0.3 }
}

export function safeZoneInsets(platform: ShortPlatform): SafeZoneInsets {
  return SAFE_ZONE_INSETS[platform]
}

// The overlay shows when the user has toggled it this session, otherwise it follows the short's
// own safe-zone setting.
export function resolveSafeZones(override: boolean | null, shortSetting: boolean): boolean {
  return override ?? shortSetting
}

// Fit scales the whole frame into the preview (the layout does the sizing). 100% shows the frame at
// its canvas size, one frame pixel per CSS pixel, and the user pans to see the rest.
export const ZOOM_MODES = ['fit', 'actual'] as const
export type ZoomMode = (typeof ZOOM_MODES)[number]

export const ZOOM_LABELS: Record<ZoomMode, string> = { fit: 'Fit', actual: '100%' }

export const ACTUAL_FRAME_SIZE: Size = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
export const NO_PAN: Point = { x: 0, y: 0 }

// Panning is allowed only at 100% and only when the frame is larger than the preview on some side.
export function canPan(zoom: ZoomMode, frame: Size, viewport: Size): boolean {
  return zoom === 'actual' && (frame.width > viewport.width || frame.height > viewport.height)
}

// How far the frame may move from the centre on each axis. A frame smaller than the viewport on an
// axis stays centred, so the limit there is zero.
export function panLimits(frame: Size, viewport: Size): Point {
  return {
    x: Math.max(0, (frame.width - viewport.width) / 2),
    y: Math.max(0, (frame.height - viewport.height) / 2)
  }
}

export function clampPan(pan: Point, frame: Size, viewport: Size): Point {
  const limits = panLimits(frame, viewport)
  return {
    x: Math.min(limits.x, Math.max(-limits.x, pan.x)),
    y: Math.min(limits.y, Math.max(-limits.y, pan.y))
  }
}

// Moves the pan by a pointer delta and keeps the frame's edges inside the limits.
export function panBy(pan: Point, delta: Point, frame: Size, viewport: Size): Point {
  return clampPan({ x: pan.x + delta.x, y: pan.y + delta.y }, frame, viewport)
}
