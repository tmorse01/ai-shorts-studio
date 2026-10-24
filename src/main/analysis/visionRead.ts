// Reads one media item's vision descriptions for the renderer's search index. A missing or damaged
// file is not an error: the item simply has no described shots yet.
import { loadVisionResult } from '../ai/visionResultFile'
import { visionResultPath } from './analysisFile'

export async function readMediaVision(
  projectFolder: string,
  mediaId: string
): Promise<{ shots: { shotIndex: number; description: string; tags: string[] }[] }> {
  const result = await loadVisionResult(visionResultPath(projectFolder, mediaId))
  return {
    shots: (result?.shots ?? []).map((shot) => ({
      shotIndex: shot.shotIndex,
      description: shot.description,
      tags: shot.tags
    }))
  }
}
