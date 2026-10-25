// The wire shape of a footage match (Epic 15, #139). Only the renderer holds the search index, so it sends
// the search documents with the script lines. Main rebuilds an index from them, runs the matcher (#138) and
// returns the assembly plan for review. Nothing reaches the timeline from here.
import { z } from 'zod'
import { shotRangeSchema } from '../analysis/analysis'
import { SEARCH_KINDS } from '../search/searchIndex'
import { assemblyPlanSchema } from './assemblyPlan'

const nonEmptyString = z.string().trim().min(1)
const MAX_LINES = 80
const MAX_DOCS = 50000

export const searchDocSchema = z.object({
  id: nonEmptyString,
  mediaId: nonEmptyString,
  kind: z.enum(SEARCH_KINDS),
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative()
})

export const footageMatchRequestSchema = z.object({
  lines: z
    .array(z.object({ lineId: nonEmptyString, text: z.string() }))
    .min(1)
    .max(MAX_LINES),
  /** The script's target length in milliseconds, or null when it is open. */
  targetMs: z.number().positive().nullable(),
  docs: z.array(searchDocSchema).max(MAX_DOCS),
  mediaNames: z.record(z.string(), z.string()),
  shots: z.record(z.string(), z.array(shotRangeSchema)),
  durationsMs: z.record(z.string(), z.number().nonnegative())
})
export type FootageMatchRequest = z.input<typeof footageMatchRequestSchema>

export const footageMatchResultSchema = z.object({
  plan: assemblyPlanSchema,
  unmatchedLineIds: z.array(z.string()),
  totalMs: z.number().nonnegative(),
  targetHit: z.boolean().nullable()
})
export type FootageMatchResultData = z.output<typeof footageMatchResultSchema>
