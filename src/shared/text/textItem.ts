// A text overlay on a text track (Epic 13, #126). A text clip holds one of these as its textItem.
// Position is an anchor on the frame, as fractions of its width and height, so the same item lands in
// the same place at any resolution. Pure data plus a zod schema.
import { z } from 'zod'
import { textColorNameSchema, textStyleIdSchema, type TextStyleId } from './textStyles'

// How the item appears and leaves. 'fade' fades it in from nothing at the clip's start and out to
// nothing at its end. 'none' (the default when the key is absent) cuts.
export const textMotionSchema = z.enum(['none', 'fade'])
export type TextMotion = z.infer<typeof textMotionSchema>

export const textItemSchema = z.object({
  text: z.string().max(500),
  styleId: textStyleIdSchema,
  // Centre of the text as fractions of the frame: 0 is the left or top edge, 1 the right or bottom.
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  // Multiplies the style's font size. Positive, so the text never disappears by accident.
  scale: z.number().positive().max(4),
  enter: textMotionSchema.optional(),
  exit: textMotionSchema.optional(),
  // A palette colour that replaces the style's fill. Absent keeps the style's colour. Schema 14 added it.
  color: textColorNameSchema.optional(),
  // A palette colour for a box behind the text. Absent draws no box. Schema 14 added it.
  backdrop: textColorNameSchema.optional()
})
export type TextItem = z.infer<typeof textItemSchema>

// A new item in the middle of the frame, in the caption style. Read `enter` and `exit` as 'none'.
export function createTextItem(text: string, styleId: TextStyleId = 'caption'): TextItem {
  return { text, styleId, x: 0.5, y: 0.5, scale: 1 }
}
