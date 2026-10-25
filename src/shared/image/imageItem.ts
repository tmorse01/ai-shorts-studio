// An image overlay on an overlay track (Epic 13, #129): a logo, map or sticker. The clip holds the picture
// (its mediaId) and this item holds how it looks and moves. Its position and size come from the clip's
// transform, so the canvas gizmo moves it like a video clip. Pure data plus a zod schema.
import { z } from 'zod'
import { textMotionSchema } from '../text/textItem'
import { MAX_TEXT_MOTION_MS, MIN_TEXT_MOTION_MS } from '../text/textMotion'

// How long a new image overlay stays on the timeline. Images have no length of their own.
export const IMAGE_OVERLAY_DEFAULT_MS = 3000

export const imageItemSchema = z.object({
  // Opacity from 0 (invisible) to 1 (solid). Absent means 1, read as `?? 1`.
  opacity: z.number().min(0).max(1).optional(),
  // Entry and exit motions, as for text overlays (see ../text/textItem.ts). Absent means none.
  enter: textMotionSchema.optional(),
  exit: textMotionSchema.optional(),
  // How long each motion lasts, in ms. Absent uses the default (../text/textMotion.ts).
  motionMs: z.number().int().min(MIN_TEXT_MOTION_MS).max(MAX_TEXT_MOTION_MS).optional()
})
export type ImageItem = z.infer<typeof imageItemSchema>

export const MIN_IMAGE_OPACITY = 0
export const MAX_IMAGE_OPACITY = 1
