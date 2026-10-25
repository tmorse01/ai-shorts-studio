// The project.json contract, shared by main (storage service) and renderer. Data model from Epic 02
// (#2). Scripts come from Epic 14 (#14). `timeline` comes from Epic 06.
import { z } from 'zod'
import { timelineSchema } from '../timeline/timeline'
import { captionPresetSchema } from '../captions/captionPreset'
import { batchSchema } from '../batch/batch'

// Bump this when the shape changes, and add a migration in ./migrations.ts from the old version.
export const CURRENT_SCHEMA_VERSION = 20

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
  kind: mediaKindSchema,
  // Set by the user's "Use proxy" toggle. Playback reads the proxy only when this is true and it is ready.
  useProxy: z.boolean().optional(),
  // Ids of the tags on this file: built-in tags (see src/renderer/features/media/mediaTags.ts) or
  // custom tags from the project's mediaTags list. Unset means no tags.
  tagIds: z.array(nonEmptyString).optional()
})
export type MediaRef = z.infer<typeof mediaRefSchema>

// A custom tag the user made for footage. Built-in tags are not stored here.
export const mediaTagSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString
})
export type MediaTag = z.infer<typeof mediaTagSchema>

export const momentCreatorSchema = z.enum(['user', 'ai'])
export type MomentCreator = z.infer<typeof momentCreatorSchema>

// A named range of one source clip, saved from the source viewer. Times are source milliseconds.
// `tags` holds tag ids from the same list as media tags (built-in and custom).
export const momentSchema = z
  .object({
    id: nonEmptyString,
    mediaId: nonEmptyString,
    name: nonEmptyString,
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().nonnegative(),
    tags: z.array(nonEmptyString),
    createdBy: momentCreatorSchema,
    note: z.string().optional()
  })
  .refine((moment) => moment.outMs > moment.inMs, {
    message: 'outMs must be greater than inMs'
  })
export type Moment = z.infer<typeof momentSchema>

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
  // The script this short is written from. Unset until one is attached (schema 8).
  scriptId: nonEmptyString.optional(),
  // The caption preset this short uses by default. Unset means the project's default preset (schema 14).
  captionPresetId: nonEmptyString.optional(),
  exportedAt: isoTimestamp.optional(),
  // Set when an Exported short is edited. Cleared by the next export (Epic 17).
  editedSinceExport: z.boolean(),
  // The short's edit timeline (see src/shared/timeline). Empty for a new short.
  timeline: timelineSchema
})
export type Short = z.infer<typeof shortSchema>

// One line of a script. `beat` and `footageHints` are optional planning notes for the editor.
export const scriptLineSchema = z.object({
  id: nonEmptyString,
  text: z.string(),
  beat: z.string().optional(),
  footageHints: z.array(nonEmptyString).optional()
})
export type ScriptLine = z.infer<typeof scriptLineSchema>

// A script stored in the project. Shorts reference one by `scriptId`. Schema 8 changed this shape.
export const scriptSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  topic: z.string(),
  lines: z.array(scriptLineSchema)
})
export type Script = z.infer<typeof scriptSchema>

export const projectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: nonEmptyString,
  name: nonEmptyString,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  media: z.array(mediaRefSchema),
  // Custom media tags, in the order the user created them. Schema 6 added this list.
  mediaTags: z.array(mediaTagSchema),
  // Saved source ranges, in the order they were made. Schema 7 added this list.
  moments: z.array(momentSchema),
  defaults: shortDefaultsSchema,
  shorts: z.array(shortSchema),
  scripts: z.array(scriptSchema),
  // Caption style presets this project offers. Unset means the shipped defaults (schema 14).
  captionPresets: z.array(captionPresetSchema).optional(),
  // Batch analysis runs this project has started. Unset means none (schema 19).
  batches: z.array(batchSchema).optional()
})
export type Project = z.infer<typeof projectSchema>
