// Generates captions for a short from its narration clips or its cut clips (Epic 11, #118). Transcribes
// the media that needs it through main, remaps the words to timeline time, and runs one command that
// replaces the captions in the clips' range. Running it again regenerates that range.
import type { Track } from '@shared/timeline/timeline'
import {
  captionBlocksForClips,
  clipsSpan,
  type CaptionSourceClip
} from '@shared/captions/captionRemap'
import type { TranscriptWord } from '@shared/analysis/transcript'
import { projectStore } from '../project/projectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { toast } from '../toasts/toast'
import { generateCaptionsCommand } from './captionCommands'

export type CaptionSource = 'narration' | 'cut'

const SOURCE_LABEL: Record<CaptionSource, string> = {
  narration: 'narration',
  cut: 'cuts'
}

function newId(): string {
  return globalThis.crypto.randomUUID()
}

// Clips on the track that holds the chosen source, with what captions need from each.
function sourceClips(track: Track | undefined): CaptionSourceClip[] {
  return (track?.clips ?? []).flatMap((clip) =>
    clip.mediaId === undefined
      ? []
      : [
          {
            mediaId: clip.mediaId,
            startMs: clip.startMs,
            durationMs: clip.durationMs,
            sourceInMs: clip.sourceInMs
          }
        ]
  )
}

export async function generateShortCaptions(shortId: string, source: CaptionSource): Promise<void> {
  const current = projectStore.getState().current
  if (!current) return
  const { folderPath, project } = current
  const short = project.shorts.find((item) => item.id === shortId)
  if (!short) return

  const role = source === 'narration' ? 'narration' : 'main'
  const clips = sourceClips(short.timeline.tracks.find((track) => track.role === role))
  if (clips.length === 0) {
    toast.info({
      title: 'Nothing to caption',
      description: `This short has no ${SOURCE_LABEL[source]} clips with footage.`
    })
    return
  }

  const mediaIds = [...new Set(clips.map((clip) => clip.mediaId))]
  const items = project.media
    .filter((ref) => mediaIds.includes(ref.id))
    .map((ref) => ({
      id: ref.id,
      path: ref.pathKind === 'absolute' ? ref.path : `${folderPath}/${ref.path}`
    }))

  const result = await window.api.invoke('captions:transcribe', {
    projectFolder: folderPath,
    items
  })
  if (!result.ok) {
    toast.error({
      title: 'Could not transcribe the footage',
      description: result.error.message,
      details: result.error.details
    })
    return
  }

  const wordsByMedia = new Map<string, readonly TranscriptWord[]>()
  for (const entry of result.data.transcripts) {
    if (entry.transcript) wordsByMedia.set(entry.mediaId, entry.transcript.words)
  }
  const missing = mediaIds.filter((id) => !wordsByMedia.has(id)).length

  const span = clipsSpan(clips)
  if (!span) return
  const blocks = captionBlocksForClips(clips, wordsByMedia, newId)
  applyProjectCommand(
    generateCaptionsCommand({
      shortId,
      label: `Generate captions from ${SOURCE_LABEL[source]}`,
      now: new Date().toISOString(),
      rangeStartMs: span.startMs,
      rangeEndMs: span.endMs,
      blocks,
      newTrackId: newId()
    })
  )

  if (missing > 0) {
    toast.error({
      title: 'Some footage was not transcribed',
      description: `${missing} ${missing === 1 ? 'clip has' : 'clips have'} no transcript, so ${missing === 1 ? 'it has' : 'they have'} no captions.`
    })
  }
}
