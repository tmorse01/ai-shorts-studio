// Speaks one script line and places the audio on the line's narration lane (Epic 10, #114). The line row and
// the optional step after a re-assembly (Epic 15, #142) both call it, so the two share one path. Failures
// reach the user as a toast, and the function returns whether the narration was placed.
import { projectStore } from '../project/projectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { toast } from '../toasts/toast'
import { generateLineNarration } from './lineNarrationActions'
import { lineSpeechDeps } from './narrationMedia'

// The project's default voice, or null when none is set or the voices cannot be read.
export async function defaultVoiceId(projectFolder: string): Promise<string | null> {
  const result = await window.api.invoke('tts:voices', { projectFolder })
  return result.ok ? result.data.defaultVoiceId : null
}

export interface GenerateLineNowInput {
  shortId: string
  scriptId: string
  lineId: string
  lineText: string
  // Zero-based position of the line, shown to the user as Line n.
  lineIndex: number
  voiceId: string
  // True when the line already has narration, so the new audio replaces it.
  regenerate: boolean
}

export async function generateLineNow(input: GenerateLineNowInput): Promise<boolean> {
  const folderPath = projectStore.getState().current?.folderPath
  if (!folderPath) return false
  try {
    const { command, cached } = await generateLineNarration(lineSpeechDeps, {
      shortId: input.shortId,
      scriptId: input.scriptId,
      lineId: input.lineId,
      lineText: input.lineText,
      projectFolder: folderPath,
      voiceId: input.voiceId,
      regenerate: input.regenerate,
      now: new Date().toISOString(),
      clipId: crypto.randomUUID(),
      narrationTrackId: crypto.randomUUID(),
      mediaId: crypto.randomUUID()
    })
    applyProjectCommand(command)
    toast.success({
      title: cached ? 'Line narration reused' : 'Line narration made',
      description: `Line ${input.lineIndex + 1}`
    })
    return true
  } catch (error) {
    toast.error({
      title: 'Could not make the narration',
      description: error instanceof Error ? error.message : 'Try again.'
    })
    return false
  }
}
