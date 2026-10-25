// The IPC-backed pieces of per-line narration (Epic 10, #114): speaking a line through the TTS provider from
// #113, reading the audio it made, and saving a recorded take. Each call goes through an existing channel,
// and failures are thrown as plain Errors for the row to show.
import type { LineSpeechDeps, ImportedAudio, SpeechRequest } from './lineNarrationActions'

function errorText(error: { message: string }): Error {
  return new Error(error.message)
}

// Speaks a request through the existing tts:generate channel. Cached audio comes back at no cost.
export async function speakWithIpc(request: SpeechRequest) {
  const result = await window.api.invoke('tts:generate', request)
  if (!result.ok) throw errorText(result.error)
  return { audioPath: result.data.audioPath, cached: result.data.cached }
}

// Reads a file the app made (a speech file or a take) for the project's media list.
export async function importAudioWithIpc(audioPath: string): Promise<ImportedAudio> {
  const stat = await window.api.invoke('media:stat', { paths: [audioPath] })
  if (!stat.ok) throw errorText(stat.error)
  const file = stat.data.files[0]
  if (!file) throw new Error('Could not read the new narration.')
  const probe = await window.api.invoke('media:probe', { path: audioPath })
  if (!probe.ok) throw errorText(probe.error)
  return {
    path: audioPath,
    pathKind: 'absolute',
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    durationMs: Math.round(probe.data.durationSec * 1000)
  }
}

export const lineSpeechDeps: LineSpeechDeps = {
  speak: speakWithIpc,
  importAudio: importAudioWithIpc
}

// Saves a finished take as a WAV in the project's media folder. Returns the file's media details, without an id.
export async function saveTakeWithIpc(
  projectFolder: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<ImportedAudio> {
  const saved = await window.api.invoke('narration:take:save', { projectFolder, bytes })
  if (!saved.ok) throw errorText(saved.error)
  return {
    path: saved.data.path,
    pathKind: saved.data.pathKind,
    fileName: saved.data.fileName,
    sizeBytes: saved.data.sizeBytes,
    durationMs: 0
  }
}
