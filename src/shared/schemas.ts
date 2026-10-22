import { z } from 'zod'

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

export const captionSchema = z.object({
  startSec: z.number().finite().min(0),
  endSec: z.number().finite().min(0),
  text: z.string().max(500)
})

export const shortSettingsSchema = z.object({
  ratio: ratioSchema,
  framing: framingSchema,
  captionsEnabled: z.boolean(),
  captionFontSize: z.number().int().min(24).max(160),
  musicEnabled: z.boolean(),
  musicVolume: z.number().min(0).max(1),
  musicDuck: z.boolean()
})

export const shortPatchSchema = z
  .object({
    title: z.string().min(1).max(120),
    segments: z.array(segmentSchema).min(1).max(6),
    captions: z.array(captionSchema).max(500),
    settings: shortSettingsSchema
  })
  .partial()

export const createProjectSchema = z.object({ name: z.string().min(1).max(120) })

export const analysisRequestSchema = z.object({
  projectId: idSchema,
  prompt: z.string().min(1).max(2000),
  count: z.number().int().min(1).max(5),
  minSec: z.number().min(10).max(90),
  maxSec: z.number().min(10).max(90),
  ratio: ratioSchema
})

export const exportRequestSchema = z.object({
  projectId: idSchema,
  shortIds: z.array(idSchema).min(1).max(20),
  outputDir: z.string().min(1).max(1024),
  overwrite: z.boolean().default(false)
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
export type ExportRequest = z.infer<typeof exportRequestSchema>
