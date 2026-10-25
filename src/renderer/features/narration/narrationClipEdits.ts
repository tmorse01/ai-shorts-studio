// Pure rules for a narration clip's inspector section (Epic 10, #116): which fields show for the clip, the
// clip edits the section makes, and the text-to-speech request that regenerates its audio. No DOM, no disk,
// no network, so the rules are tested directly.
import type { Narration, NarrationSource } from '@shared/timeline/narration'
import type { Clip, Timeline } from '@shared/timeline/timeline'
import { speechTextSchema } from '@shared/tts/speech'

export type NarrationField = 'source' | 'scriptLine' | 'text' | 'voice' | 'regenerate'

// The fields a narration clip shows. Source, script line and text always show. Voice and regenerate show
// only for a clip made by text to speech, since only those have a voice to pick and audio to remake.
export function narrationFieldsFor(narration: Narration): NarrationField[] {
  const fields: NarrationField[] = ['source', 'scriptLine', 'text']
  if (narration.source === 'tts') fields.push('voice', 'regenerate')
  return fields
}

const SOURCE_LABELS: Record<NarrationSource, string> = {
  recorded: 'Recorded',
  imported: 'Imported',
  tts: 'Text to speech'
}

export function narrationSourceLabel(source: NarrationSource): string {
  return SOURCE_LABELS[source]
}

// The narration clip with this id, or null when the clip is missing or is not a narration clip.
export function narrationClipFor(timeline: Timeline, clipId: string): Clip | null {
  for (const track of timeline.tracks) {
    if (track.role !== 'narration') continue
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip?.narration) return clip
  }
  return null
}

// The request that speaks a clip's text in its voice. Null when the clip has no voice or its text is empty
// or too long for the provider, so the section can say what is missing instead of sending a request.
export interface RegenerateRequest {
  projectFolder: string
  voiceId: string
  text: string
}

export function regenerateRequestFor(
  projectFolder: string,
  narration: Narration
): RegenerateRequest | null {
  if (!narration.voiceId) return null
  const parsed = speechTextSchema.safeParse(narration.text ?? '')
  if (!parsed.success) return null
  return { projectFolder, voiceId: narration.voiceId, text: parsed.data }
}

// The narration fields one edit may change. scriptLineId null unlinks the clip from its line.
export interface NarrationChange {
  scriptLineId?: string | null
  voiceId?: string
  text?: string
}

function mapClip(timeline: Timeline, clipId: string, edit: (clip: Clip) => Clip): Timeline {
  let found = false
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) return clip
      found = true
      return edit(clip)
    })
  }))
  if (!found) throw new Error(`No clip with id ${clipId}`)
  return { ...timeline, tracks }
}

// Changes the narration fields of one narration clip. The audio is not touched: regenerating does that.
export function updateClipNarration(
  timeline: Timeline,
  clipId: string,
  change: NarrationChange
): Timeline {
  return mapClip(timeline, clipId, (clip) => {
    if (!clip.narration) throw new Error(`Clip ${clipId} is not a narration clip`)
    const narration: Narration = { ...clip.narration }
    if (change.scriptLineId !== undefined) {
      if (change.scriptLineId === null) delete narration.scriptLineId
      else narration.scriptLineId = change.scriptLineId
    }
    if (change.voiceId !== undefined) narration.voiceId = change.voiceId
    if (change.text !== undefined) narration.text = change.text
    return { ...clip, narration }
  })
}

export interface ReplaceNarrationAudioInput {
  mediaId: string
  durationMs: number
  voiceId: string
  text: string
}

// Points a narration clip at its new audio file and records the voice and text it was made from. The clip
// plays the new file from its start, and it takes the file's length.
export function replaceNarrationAudio(
  timeline: Timeline,
  clipId: string,
  input: ReplaceNarrationAudioInput
): Timeline {
  return mapClip(timeline, clipId, (clip) => ({
    ...clip,
    mediaId: input.mediaId,
    sourceInMs: 0,
    durationMs: Math.max(1, Math.round(input.durationMs)),
    narration: {
      ...clip.narration,
      source: 'tts',
      voiceId: input.voiceId,
      text: input.text
    }
  }))
}
