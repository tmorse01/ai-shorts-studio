// Builds the undoable command for a script line's generated narration (Epic 10, #114). The speech provider
// and the media reads are passed in, so tests use fakes and never reach the network or a key. The app passes
// the IPC-backed versions from narrationMedia.ts.
import type { MediaRef, Project } from '@shared/project/schema'
import { speechTextSchema } from '@shared/tts/speech'
import type { Command } from '../history/historyStore'
import { lineClipCommand } from './lineNarrationCommands'

export interface SpeechRequest {
  projectFolder: string
  voiceId: string
  text: string
}

export interface SpeechResult {
  audioPath: string
  cached: boolean
}

export interface ImportedAudio {
  path: string
  pathKind: MediaRef['pathKind']
  fileName: string
  sizeBytes: number
  durationMs: number
}

export interface LineSpeechDeps {
  speak: (request: SpeechRequest) => Promise<SpeechResult>
  importAudio: (audioPath: string) => Promise<ImportedAudio>
}

export interface GenerateLineInput {
  shortId: string
  scriptId: string
  lineId: string
  lineText: string
  projectFolder: string
  voiceId: string
  // Generate for a line with no clip, or regenerate for one that has a clip.
  regenerate: boolean
  now: string
  clipId: string
  narrationTrackId: string
  mediaId: string
}

export interface GeneratedLine {
  command: Command<Project>
  cached: boolean
}

// Speaks one line in the chosen voice and returns the command that places the audio on its line. Nothing is
// changed in the project until the caller applies the command.
export async function generateLineNarration(
  deps: LineSpeechDeps,
  input: GenerateLineInput
): Promise<GeneratedLine> {
  const parsed = speechTextSchema.safeParse(input.lineText)
  if (!parsed.success) {
    throw new Error('The line needs some text, up to 5000 characters, to make narration.')
  }
  const speech = await deps.speak({
    projectFolder: input.projectFolder,
    voiceId: input.voiceId,
    text: parsed.data
  })
  const imported = await deps.importAudio(speech.audioPath)
  const command = lineClipCommand({
    shortId: input.shortId,
    scriptId: input.scriptId,
    lineId: input.lineId,
    label: input.regenerate ? 'Regenerate line narration' : 'Generate line narration',
    now: input.now,
    clipId: input.clipId,
    narrationTrackId: input.narrationTrackId,
    media: {
      id: input.mediaId,
      path: imported.path,
      pathKind: imported.pathKind,
      fileName: imported.fileName,
      sizeBytes: imported.sizeBytes,
      durationMs: imported.durationMs,
      kind: 'audio'
    },
    durationMs: imported.durationMs,
    source: 'tts',
    voiceId: input.voiceId,
    text: parsed.data
  })
  return { command, cached: speech.cached }
}
