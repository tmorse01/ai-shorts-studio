// What the renderer needs to know about each media item's files: whether the original is on disk and
// whether a proxy is ready. Paths stay in main; the renderer only gets these flags.
import { z } from 'zod'
import { pathKindSchema } from '../project/schema'

export const mediaSourceRefSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  path: z.string().min(1),
  pathKind: pathKindSchema
})
export type MediaSourceRef = z.infer<typeof mediaSourceRefSchema>

export const mediaSourceInfoSchema = z.object({
  id: z.string().min(1),
  online: z.boolean(),
  hasProxy: z.boolean()
})
export type MediaSourceInfo = z.infer<typeof mediaSourceInfoSchema>
