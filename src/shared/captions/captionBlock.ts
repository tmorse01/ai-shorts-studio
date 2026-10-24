// Caption blocks on a captions track (Epic 11, #117). A block is a run of words with their timings
// on the timeline. Pure data plus zod schemas, shared by main and the renderer. Chunking, split and
// merge live in ./captionEdits.ts.
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

// One spoken word. Times are whole timeline milliseconds.
export const captionWordSchema = z
  .object({
    text: nonEmptyString,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative()
  })
  .refine((word) => word.endMs >= word.startMs, {
    message: 'endMs must not be less than startMs'
  })
export type CaptionWord = z.infer<typeof captionWordSchema>

// A caption on screen: its words in order. `styleId` is optional so a block with no style needs no
// key. Read it as the track or project default when unset.
export const captionBlockSchema = z.object({
  id: nonEmptyString,
  words: z.array(captionWordSchema).min(1),
  styleId: nonEmptyString.optional()
})
export type CaptionBlock = z.infer<typeof captionBlockSchema>
