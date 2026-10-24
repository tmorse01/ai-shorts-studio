// The project.json contract, shared by main (storage service) and renderer. Data model from Epic 02
// (#2). `timeline` and script `lines` are permissive placeholders owned by Epics 07 and 14.
import { z } from 'zod'

// Bump this when the shape changes, and add a migration in ./migrations.ts from the old version.
export const CURRENT_SCHEMA_VERSION = 2

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
  durationMs: z.number().int().nonnegative().optional(),
  kind: mediaKindSchema
})
export type MediaRef = z.infer<typeof mediaRefSchema>

export const shortStatusSchema = z.enum(['draft', 'ready', 'exported'])
export type ShortStatus = z.infer<typeof shortStatusSchema>

export const shortSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  status: shortStatusSchema,
  // Placeholder until the timeline model lands (Epic 07). Unknown keys are kept, not stripped.
  timeline: z.looseObject({})
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
  shorts: z.array(shortSchema),
  scripts: z.array(scriptSchema)
})
export type Project = z.infer<typeof projectSchema>
