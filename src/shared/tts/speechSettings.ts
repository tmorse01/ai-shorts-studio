// Per-project speech settings: the default voice. Stored in the project folder, not project.json, so it
// does not change the project schema.
import { z } from 'zod'

export const speechSettingsSchema = z.object({
  defaultVoiceId: z.string().min(1).nullable()
})
export type SpeechSettings = z.infer<typeof speechSettingsSchema>

export function emptySpeechSettings(): SpeechSettings {
  return { defaultVoiceId: null }
}
