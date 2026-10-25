// Reads and writes the speech settings kept in the project folder (speech/speech.json). A damaged file is
// treated as no default voice, so it never blocks the project.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptySpeechSettings,
  speechSettingsSchema,
  type SpeechSettings
} from '@shared/tts/speechSettings'

export const SPEECH_DIR = 'speech'
export const SPEECH_SETTINGS_FILE = 'speech.json'

export async function loadSpeechSettings(projectFolder: string): Promise<SpeechSettings> {
  let text: string
  try {
    text = await readFile(join(projectFolder, SPEECH_DIR, SPEECH_SETTINGS_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptySpeechSettings()
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return emptySpeechSettings()
  }
  const parsed = speechSettingsSchema.safeParse(json)
  return parsed.success ? parsed.data : emptySpeechSettings()
}

export async function saveSpeechSettings(
  projectFolder: string,
  settings: SpeechSettings
): Promise<void> {
  const dir = join(projectFolder, SPEECH_DIR)
  await mkdir(dir, { recursive: true })
  const target = join(dir, SPEECH_SETTINGS_FILE)
  const tmp = `${target}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(settings, null, 2), 'utf8')
  await rename(tmp, target)
}
