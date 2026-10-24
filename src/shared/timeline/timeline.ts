// The timeline contract stored on each short (Epic 06, #75). Times are whole milliseconds on the
// timeline unless a field says it is a source time. Pure data plus zod schemas, shared by main and
// the renderer. Behaviour lives in ./resolveFrame.ts.
import { z } from 'zod'
import { clipFramingSchema } from './framing'
import { duckingSchema } from './ducking'

const nonEmptyString = z.string().trim().min(1)

export const trackKindSchema = z.enum(['video', 'audio', 'text', 'overlay'])
export type TrackKind = z.infer<typeof trackKindSchema>

// What a track is for. Only the main track is a sequence: its clips never overlap and an insert
// shifts later clips. The other roles are free layers.
export const trackRoleSchema = z.enum(['main', 'overlay', 'narration', 'music', 'captions', 'text'])
export type TrackRole = z.infer<typeof trackRoleSchema>

export const transformSchema = z.object({
  // Offsets from the frame centre, in canvas pixels.
  x: z.number(),
  y: z.number(),
  scale: z.number().positive(),
  // Extra width-to-height stretch on top of the uniform scale. Optional so existing clips need no key.
  // Read it as `?? 1`. Only a free (Shift) corner drag sets it.
  stretch: z.number().positive().optional(),
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
  // Linear loudness of the clip's sound, 0 to 2. Optional so existing clips need no key. Read it as
  // `?? 1`.
  gain: z.number().min(0).max(2).optional(),
  // Silences the clip's sound in the preview mix. Optional so existing clips need no key. Read it as
  // `?? false`.
  muted: z.boolean().optional(),
  text: z.string().optional(),
  label: z.string().optional(),
  // The moment (Epic 14 script beat) this clip was dropped from, when it came from one.
  momentId: nonEmptyString.optional(),
  // Id of the audio clip split off this clip by "detach audio".
  linkedAudio: nonEmptyString.optional(),
  // How the clip's source fills the vertical frame (see ./framing.ts). Unset means no framing.
  // Schema 8 added this key.
  framing: clipFramingSchema.optional()
})
export type Clip = z.infer<typeof clipSchema>

export const trackSchema = z.object({
  id: nonEmptyString,
  kind: trackKindSchema,
  role: trackRoleSchema,
  muted: z.boolean(),
  // A locked track refuses clip edits. Optional so existing tracks need no key. Read it as `?? false`.
  locked: z.boolean().optional(),
  clips: z.array(clipSchema)
})
export type Track = z.infer<typeof trackSchema>

// A transition between two clips on the same track. Its length is the overlap the edit shows.
export const transitionSchema = z.object({
  id: nonEmptyString,
  fromClipId: nonEmptyString,
  toClipId: nonEmptyString,
  durationMs: z.number().int().positive()
})
export type Transition = z.infer<typeof transitionSchema>

// Tracks are listed bottom to top: a later track draws over an earlier one.
export const timelineSchema = z.object({
  tracks: z.array(trackSchema),
  // Optional so a timeline with no transitions needs no key. Read it as `?? []`.
  transitions: z.array(transitionSchema).optional(),
  // Auto-ducking under narration (see ./ducking.ts). Optional, so a short without it uses the defaults.
  // Schema 10 added this key.
  ducking: duckingSchema.optional()
})
export type Timeline = z.infer<typeof timelineSchema>
