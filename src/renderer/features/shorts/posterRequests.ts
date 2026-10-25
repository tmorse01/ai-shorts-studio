// The poster requests of the shorts on screen: which footage frame each short shows, and the view the
// card or panel draws for it. Pure (no React, no window), so the queueing and the URL rules are tested
// directly.
import type { MediaRef, Short } from '@shared/project/schema'
import { posterUrl } from '@shared/media/posterSource'
import { posterFileName, posterTarget, type PosterFrameRef } from '@shared/shorts/poster'

export interface PosterRequest extends PosterFrameRef {
  path: string
  pathKind: MediaRef['pathKind']
}

// What a poster slot shows. Loading means the frame is queued or rendering. Ready carries the URL to load.
export type PosterView =
  { status: 'empty' } | { status: 'loading' } | { status: 'ready'; src: string }

// The frame each short shows, with the footage file it comes from. Shorts with no video clip, or whose
// footage is no longer in the project, have no request and show the empty state.
export function posterRequestsFor(
  shorts: readonly Short[],
  media: readonly MediaRef[]
): PosterRequest[] {
  const requests: PosterRequest[] = []
  for (const short of shorts) {
    const target = posterTarget(short.timeline, short.posterMs)
    if (!target) continue
    const ref = media.find((item) => item.id === target.mediaId)
    if (!ref) continue
    requests.push({
      shortId: short.id,
      mediaId: target.mediaId,
      sourceTimeMs: target.sourceTimeMs,
      path: ref.path,
      pathKind: ref.pathKind
    })
  }
  return requests
}

// The frame a request names, without the footage path.
export function frameOf(request: PosterRequest): PosterFrameRef {
  return {
    shortId: request.shortId,
    mediaId: request.mediaId,
    sourceTimeMs: request.sourceTimeMs
  }
}

// The URL of a rendered frame. The file name follows the frame, so moving the poster changes the URL, and
// the version changes it again when the frame is rendered anew.
export function posterSrcFor(request: PosterRequest, version: number): string {
  return posterUrl(request.shortId, posterFileName(request), version)
}

// Sends the frames that are not rendered yet to main, which queues one poster job for each. Used when the
// poster changes, so the job runs even when no Export panel or grid is showing the short.
export type PosterQueue = (
  projectFolder: string,
  items: PosterRequest[]
) => Promise<{ ok: boolean }>

export function queueShortPoster(
  queue: PosterQueue,
  projectFolder: string,
  short: Short,
  media: readonly MediaRef[]
): Promise<{ ok: boolean }> {
  const items = posterRequestsFor([short], media)
  return queue(projectFolder, items)
}
