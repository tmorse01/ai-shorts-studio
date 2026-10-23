import { z } from 'zod'
import { MAX_SHORT_SEC, MIN_SHORT_SEC } from './timeline'

export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'Invalid id')

export const ratioSchema = z.enum(['original', '16:9', '9:16', '1:1'])

export const framingSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  mode: z.enum(['crop', 'fit'])
})

export const segmentSchema = z
  .object({
    startSec: z.number().finite().min(0).max(24 * 3600),
    endSec: z.number().finite().min(0).max(24 * 3600)
  })
  .refine((s) => s.endSec > s.startSec, 'endSec must be after startSec')

/** A cut with its place on the short's timeline. */
export const timelineCutSchema = segmentSchema.and(z.object({ atSec: z.number().finite().min(0).max(24 * 3600) }))

export const captionSchema = z.object({
  startSec: z.number().finite().min(0),
  endSec: z.number().finite().min(0),
  text: z.string().max(500)
})

/** A piece of a music track placed on the short's timeline. */
export const musicClipSchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().min(1).max(64),
  /** Where the clip starts on the short's timeline, in seconds. */
  startSec: z.number().finite().min(0),
  /** Where in the track the clip starts, in seconds. */
  trackStartSec: z.number().finite().min(0),
  lengthSec: z.number().finite().positive()
})

export const shortSettingsSchema = z.object({
  ratio: ratioSchema,
  framing: framingSchema,
  captionsEnabled: z.boolean(),
  captionFontSize: z.number().int().min(24).max(160),
  musicClips: z.array(musicClipSchema).max(64).default([]),
  lengthSec: z.number().finite().min(MIN_SHORT_SEC).max(MAX_SHORT_SEC).default(30),
  musicVolume: z.number().min(0).max(1),
  musicDuck: z.boolean()
})

export const shortPatchSchema = z
  .object({
    title: z.string().min(1).max(120),
    segments: z.array(timelineCutSchema).min(1).max(6),
    captions: z.array(captionSchema).max(500),
    settings: shortSettingsSchema
  })
  .partial()

export const createProjectSchema = z.object({ name: z.string().min(1).max(120) })

/**
 * How scene cuts are found. `full` decodes every frame (slowest, most cuts). `keyframes` decodes only
 * I-frames (much faster, can miss cuts inside a GOP). `off` skips detection and uses the even grid.
 */
export const sceneDetectionSchema = z.enum(['off', 'keyframes', 'full'])

export const projectUpdateSchema = z.object({
  id: idSchema,
  patch: z.object({ name: z.string().min(1).max(120) }).partial()
})

export const analysisRequestSchema = z.object({
  projectId: idSchema,
  sourceId: idSchema,
  prompt: z.string().min(1).max(2000),
  count: z.number().int().min(1).max(5),
  minSec: z.number().min(10).max(90),
  maxSec: z.number().min(10).max(90),
  ratio: ratioSchema,
  sceneDetection: sceneDetectionSchema.default('full')
})

export type SceneDetection = z.infer<typeof sceneDetectionSchema>

export const exportOptionsSchema = z.object({
  quality: z.enum(['high', 'standard', 'small']).default('standard'),
  resolution: z.enum(['1080p', '720p']).default('1080p'),
  fps: z.union([z.literal('source'), z.literal(30), z.literal(60)]).default('source'),
  audioKbps: z.union([z.literal(128), z.literal(160), z.literal(192)]).default(160)
})

export const exportRequestSchema = z.object({
  projectId: idSchema,
  shortIds: z.array(idSchema).min(1).max(20),
  outputDir: z.string().min(1).max(1024),
  overwrite: z.boolean().default(false),
  options: exportOptionsSchema.default({})
})

export const apiKeySchema = z.object({
  key: z.string().min(20).max(300)
})

export const narrationSchema = z.object({
  projectId: idSchema,
  shortId: idSchema,
  audio: z.instanceof(Uint8Array).refine((b) => b.byteLength > 0 && b.byteLength < 200 * 1024 * 1024)
})

export type ShortSettings = z.infer<typeof shortSettingsSchema>
export type ShortPatch = z.infer<typeof shortPatchSchema>
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
export type ExportOptions = z.infer<typeof exportOptionsSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>
