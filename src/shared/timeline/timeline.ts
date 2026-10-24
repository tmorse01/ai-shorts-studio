// The timeline contract stored on each short (Epic 06, #75). Times are whole milliseconds on the
// timeline unless a field says it is a source time. Pure data plus zod schemas, shared by main and
// the renderer. Behaviour lives in ./resolveFrame.ts.
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const trackKindSchema = z.enum(['video', 'audio', 'text', 'overlay'])
export type TrackKind = z.infer<typeof trackKindSchema>

export const transformSchema = z.object({
  // Offsets from the frame centre, in canvas pixels.
  x: z.number(),
  y: z.number(),
  scale: z.number().positive(),
  rotationDeg: z.number()
})
export type Transform = z.infer<typeof transformSchema>

export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

export const clipSchema = z.object({
  id: nonEmptyString,
  // Footage reference (see MediaRef). Text clips have none.
  mediaId: nonEmptyString.optional(),
  // Where the clip starts on the timeline.
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  // Where in the source the clip starts playing. Source time = sourceInMs + (t - startMs).
  sourceInMs: z.number().int().nonnegative(),
  transform: transformSchema,
  text: z.string().optional()
})
export type Clip = z.infer<typeof clipSchema>

export const trackSchema = z.object({
  id: nonEmptyString,
  kind: trackKindSchema,
  muted: z.boolean(),
  clips: z.array(clipSchema)
})
export type Track = z.infer<typeof trackSchema>

// Tracks are listed bottom to top: a later track draws over an earlier one.
export const timelineSchema = z.object({
  tracks: z.array(trackSchema)
})
export type Timeline = z.infer<typeof timelineSchema>
