// Queues the poster frame for each short whose frame is not cached yet. Run whenever the project home
// asks, so a cleared cache is rendered again the next time the shorts are shown.
import { access } from 'node:fs/promises'
import { resolveMediaPath } from './mediaPaths'
import type { PathKind } from '@shared/project/schema'
import type { PosterFrameRef } from '@shared/shorts/poster'
import { posterFramePath } from './posters'

export interface PosterItem extends PosterFrameRef {
  // The footage file, as stored on its media ref.
  path: string
  pathKind: PathKind
}

export interface PosterCounts {
  queued: number
  // Frames already on disk.
  cached: number
}

// The part of the job queue the poster code needs. Tests pass a fake.
export interface PosterQueue {
  enqueue: (
    kind: 'poster',
    path: string,
    extra: { outPath: string; sourceTimeSec: number }
  ) => { done: Promise<unknown> }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

// `pending` holds the output paths of posters already queued, so repeated requests while a frame
// renders do not queue it twice. A path leaves the set when its job settles, either way.
export async function ensureShortPosters(
  projectFolder: string,
  items: readonly PosterItem[],
  queue: PosterQueue,
  pending: Set<string>,
  fileExists: (file: string) => Promise<boolean> = exists
): Promise<PosterCounts> {
  const counts: PosterCounts = { queued: 0, cached: 0 }
  for (const item of items) {
    const outPath = posterFramePath(projectFolder, item)
    if (await fileExists(outPath)) {
      counts.cached += 1
      continue
    }
    if (pending.has(outPath)) continue
    pending.add(outPath)
    const job = queue.enqueue('poster', resolveMediaPath(projectFolder, item), {
      outPath,
      sourceTimeSec: item.sourceTimeMs / 1000
    })
    const release = () => {
      pending.delete(outPath)
    }
    job.done.then(release, release)
    counts.queued += 1
  }
  return counts
}
