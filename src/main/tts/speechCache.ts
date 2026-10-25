// Generated speech lives in the project's cache folder, so it can be deleted and rebuilt without losing
// project data. The key is a hash of everything that changes the audio, so the same text in the same
// voice is never sent twice. The API key is not part of the key or the file.
import { createHash } from 'node:crypto'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SPEECH_MODEL_ID, SPEECH_PROVIDER } from '@shared/tts/speech'

export interface SpeechCacheInput {
  voiceId: string
  text: string
  /** Defaults to the app's model. Passed so a model change never reuses old audio. */
  modelId?: string
}

/** The cache key for one piece of speech: a SHA-256 of the provider, model, voice, text and format. */
export function speechCacheKey({
  voiceId,
  text,
  modelId = SPEECH_MODEL_ID
}: SpeechCacheInput): string {
  return createHash('sha256')
    .update(JSON.stringify([SPEECH_PROVIDER, modelId, voiceId, text, 'mp3']))
    .digest('hex')
}

export function speechCacheDir(projectFolder: string): string {
  return join(projectFolder, 'cache', 'tts')
}

export function speechCachePath(projectFolder: string, key: string): string {
  return join(speechCacheDir(projectFolder), `${key}.mp3`)
}

export async function speechCacheExists(projectFolder: string, key: string): Promise<boolean> {
  try {
    await access(speechCachePath(projectFolder, key))
    return true
  } catch {
    return false
  }
}

/** Writes the audio through a temp file, so a half-written clip is never read as cached. */
export async function writeSpeechCache(
  projectFolder: string,
  key: string,
  audio: Buffer
): Promise<string> {
  const dir = speechCacheDir(projectFolder)
  await mkdir(dir, { recursive: true })
  const target = speechCachePath(projectFolder, key)
  const tmp = `${target}.${process.pid}.tmp`
  await writeFile(tmp, audio)
  await rename(tmp, target)
  return target
}
