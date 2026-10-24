// Gathers the footage a script can be grounded in: each media item's cached transcript segments and its
// vision shot descriptions, with the shot's time range from the analysis file. Only text is read here,
// never video. Missing or damaged caches are skipped, so a project with no analysis still drafts scripts
// from the topic and notes.
import { loadAnalysisFile, visionResultPath } from '../analysis/analysisFile'
import { readMediaTranscript } from '../analysis/transcriptRead'
import type { ShotNote, TranscriptExcerpt } from '@shared/ai/scriptContext'
import { loadVisionResult } from './visionResultFile'

export interface FootageMedia {
  id: string
  fileName: string
}

export interface ScriptFootage {
  transcript: TranscriptExcerpt[]
  shots: ShotNote[]
}

/** Reads the footage for a set of media items. Tests pass a fake, so no disk is read. */
export type ScriptFootageSource = (
  projectFolder: string,
  media: readonly FootageMedia[]
) => Promise<ScriptFootage>

export async function readScriptFootage(
  projectFolder: string,
  media: readonly FootageMedia[]
): Promise<ScriptFootage> {
  const analysis = await loadAnalysisFile(projectFolder)
  const transcript: TranscriptExcerpt[] = []
  const shots: ShotNote[] = []

  for (const item of media) {
    const { transcript: cached } = await readMediaTranscript(projectFolder, item.id)
    for (const segment of cached?.segments ?? []) {
      transcript.push({
        mediaName: item.fileName,
        startSec: segment.startMs / 1000,
        text: segment.text
      })
    }

    // A vision shot's index is its position in the shots stage's ranges.
    const ranges = analysis.records[item.id]?.shots ?? []
    const vision = await loadVisionResult(visionResultPath(projectFolder, item.id))
    for (const shot of vision?.shots ?? []) {
      const range = ranges[shot.shotIndex]
      if (!range) continue
      shots.push({
        mediaName: item.fileName,
        shotIndex: shot.shotIndex,
        startSec: range.startSec,
        endSec: range.endSec,
        description: shot.description,
        tags: shot.tags
      })
    }
  }

  return { transcript, shots }
}
