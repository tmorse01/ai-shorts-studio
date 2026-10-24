// Makes sure each media item has a transcript for caption generation (Epic 11, #118). A cached transcript
// is reused. A missing one is made by the transcript stage (#50) as an analysis job, so it shares the
// job queue and the cache with the analysis pipeline. An item whose job fails comes back as null.
import type { Transcript } from '@shared/analysis/transcript'
import type { JobInput } from '../jobs/jobQueue'
import { analysisFramesDir } from '../analysis/frameCache'
import { readMediaTranscript } from '../analysis/transcriptRead'

export interface TranscribeQueue {
  enqueue: (
    kind: 'analysis',
    path: string,
    extra: Omit<JobInput, 'path'>
  ) => { done: Promise<unknown> }
}

export interface TranscribeItem {
  id: string
  path: string
}

export interface TranscribeResult {
  mediaId: string
  transcript: Transcript | null
}

type ReadTranscript = (
  projectFolder: string,
  mediaId: string
) => Promise<{ transcript: Transcript | null }>

export async function transcribeMediaItems(
  projectFolder: string,
  items: readonly TranscribeItem[],
  queue: TranscribeQueue,
  read: ReadTranscript = readMediaTranscript
): Promise<TranscribeResult[]> {
  const results: TranscribeResult[] = []
  for (const item of items) {
    let { transcript } = await read(projectFolder, item.id)
    if (!transcript) {
      try {
        await queue.enqueue('analysis', item.path, {
          stage: 'transcript',
          outDir: analysisFramesDir(projectFolder, item.id)
        }).done
        transcript = (await read(projectFolder, item.id)).transcript
      } catch {
        transcript = null
      }
    }
    results.push({ mediaId: item.id, transcript })
  }
  return results
}
