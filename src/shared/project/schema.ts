// The project.json contract, shared by main (storage service) and renderer. Data model from Epic 02
// (#2). Script `lines` is a permissive placeholder owned by Epic 14. `timeline` comes from Epic 06.
import { z } from 'zod'
import { timelineSchema } from '../timeline/timeline'

// Bump this when the shape changes, and add a migration in ./migrations.ts from the old version.
export const CURRENT_SCHEMA_VERSION = 4

const nonEmptyString = z.string().trim().min(1)
const isoTimestamp = z.iso.datetime()

export const mediaKindSchema = z.enum(['video', 'audio', 'image'])
export type MediaKind = z.infer<typeof mediaKindSchema>

export const pathKindSchema = z.enum(['relative', 'absolute'])
export type PathKind = z.infer<typeof pathKindSchema>

// A reference to footage on disk. The file is referenced in place, never copied.
export const mediaRefSchema = z.object({
  id: nonEmptyString,
  // Relative to the project folder when pathKind is 'relative', otherwise an absolute path.
  path: nonEmptyString,
  pathKind: pathKindSchema,
  fileName: nonEmptyString,
  sizeBytes: z.number().int().nonnegative(),
  // Not an integer: durations can be fractional (for example 61.25 seconds in ms).
  durationMs: z.number().nonnegative().optional(),
  kind: mediaKindSchema
})
export type MediaRef = z.infer<typeof mediaRefSchema>

export const shortStatusSchema = z.enum(['draft', 'ready', 'exported'])
export type ShortStatus = z.infer<typeof shortStatusSchema>

export const shortPlatformSchema = z.enum(['youtube', 'tiktok', 'reels', 'generic'])
export type ShortPlatform = z.infer<typeof shortPlatformSchema>

export const targetLengthSchema = z
  .object({
    minSec: z.number().positive(),
    maxSec: z.number().positive()
  })
  .refine((range) => range.minSec <= range.maxSec, {
    message: 'minSec must not be greater than maxSec'
  })
export type TargetLength = z.infer<typeof targetLengthSchema>

// The settings a new short copies from the project, and that a short can override.
export const shortDefaultsSchema = z.object({
  targetLength: targetLengthSchema,
  platform: shortPlatformSchema,
  safeZones: z.boolean()
})
export type ShortDefaults = z.infer<typeof shortDefaultsSchema>

export const shortOverridesSchema = shortDefaultsSchema.partial()
export type ShortOverrides = z.infer<typeof shortOverridesSchema>

// Used for projects created before schema 3 and for new projects. Shorts get 30 to 60 seconds.
export const DEFAULT_SHORT_DEFAULTS: ShortDefaults = {
  targetLength: { minSec: 30, maxSec: 60 },
  platform: 'generic',
  safeZones: true
}

export const shortSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  status: shortStatusSchema,
  // Position in the project's short list, starting at 0. Kept in step with the array index.
  order: z.number().int().nonnegative(),
  // The target length and platform the short was created with. Effective settings come from
  // the project defaults merged with `overrides` (see src/shared/shorts/shortSettings.ts).
  targetLength: targetLengthSchema,
  platform: shortPlatformSchema,
  // Settings this short changes away from the project defaults.
  overrides: shortOverridesSchema,
  // Poster frame position in milliseconds. Unset until a poster is chosen.
  posterMs: z.number().int().nonnegative().optional(),
  exportedAt: isoTimestamp.optional(),
  // Set when an Exported short is edited. Cleared by the next export (Epic 17).
  editedSinceExport: z.boolean(),
  // The short's edit timeline (see src/shared/timeline). Empty for a new short.
  timeline: timelineSchema
})
export type Short = z.infer<typeof shortSchema>

export const scriptSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  // Placeholder until the script model lands (Epic 14). Each line is kept as-is for now.
  lines: z.array(z.unknown())
})
export type Script = z.infer<typeof scriptSchema>

export const projectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: nonEmptyString,
  name: nonEmptyString,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  media: z.array(mediaRefSchema),
  defaults: shortDefaultsSchema,
  shorts: z.array(shortSchema),
  scripts: z.array(scriptSchema)
})
export type Project = z.infer<typeof projectSchema>
