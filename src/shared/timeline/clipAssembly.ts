// Assembly metadata on a clip (Epic 15, #137). A clip placed from an assembly plan records the script
// line it serves and the takes it could swap to. Pure data plus zod schemas. Behaviour lives in
// ../assembly/assemblyPlan.ts.
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

// A take that could replace a cut. Times are source milliseconds.
export const assemblyAlternativeSchema = z
  .object({
    sourceId: nonEmptyString,
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().nonnegative()
  })
  .refine((alternative) => alternative.outMs > alternative.inMs, {
    message: 'outMs must be greater than inMs'
  })
export type AssemblyAlternative = z.infer<typeof assemblyAlternativeSchema>

export const clipAssemblySchema = z.object({
  lineId: nonEmptyString,
  alternatives: z.array(assemblyAlternativeSchema)
})
export type ClipAssembly = z.infer<typeof clipAssemblySchema>
