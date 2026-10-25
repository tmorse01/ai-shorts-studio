// Narration on a clip (Epic 10, #107). A narration clip is an audio clip on the Narration lane with this
// extra data. It plays and edits like any audio clip; the key only says where the voice came from.
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const narrationSourceSchema = z.enum(['recorded', 'imported', 'tts'])
export type NarrationSource = z.infer<typeof narrationSourceSchema>

export const narrationSchema = z.object({
  // The script line this narration reads. Unset when it is not tied to a line.
  scriptLineId: nonEmptyString.optional(),
  source: narrationSourceSchema,
  // The synthetic voice used for a 'tts' clip. Unset for other sources.
  voiceId: nonEmptyString.optional(),
  // The words spoken, when they are known.
  text: z.string().optional()
})
export type Narration = z.infer<typeof narrationSchema>
