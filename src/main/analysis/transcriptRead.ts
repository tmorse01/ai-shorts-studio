// Reads one media item's cached transcript for the renderer's transcript view. A missing or damaged
// cache file is not an error: the renderer shows the clip as not analyzed.
import type { Transcript } from '@shared/analysis/transcript'
import { readTranscriptCache, transcriptCachePath } from '../transcription/transcriptStage'
import { analysisFramesDir } from './frameCache'

export async function readMediaTranscript(
  projectFolder: string,
  mediaId: string
): Promise<{ transcript: Transcript | null }> {
  const transcript = await readTranscriptCache(
    transcriptCachePath(analysisFramesDir(projectFolder, mediaId))
  )
  return { transcript: transcript ?? null }
}
