// Queues the thumbnail and filmstrip jobs that a media item's cache is missing. Run on import and
// whenever the renderer asks, so a cleared cache is rebuilt the next time the item is touched.
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { FILMSTRIP_FILE, thumbFileName } from '@shared/media/thumbs'
import type { MediaKind } from '@shared/project/schema'
import type { JobInput } from '../jobs/jobQueue'
import { thumbCacheDir } from './thumbnails'

export interface ThumbItem {
  id: string
  path: string
  kind: MediaKind
  durationSec?: number
}

export interface ThumbCounts {
  queued: number
  // Items whose thumbnails were all on disk already.
  cached: number
  // Video filmstrips that wait for the probe to report a duration.
  waiting: number
}

// The part of the job queue the thumbnail code needs. Tests pass a fake.
export interface ThumbQueue {
  enqueue: (kind: 'thumbs' | 'filmstrip', path: string, extra: Omit<JobInput, 'path'>) => unknown
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function ensureMediaThumbs(
  projectFolder: string,
  items: readonly ThumbItem[],
  queue: ThumbQueue,
  fileExists: (file: string) => Promise<boolean> = exists
): Promise<ThumbCounts> {
  const counts: ThumbCounts = { queued: 0, cached: 0, waiting: 0 }

  for (const item of items) {
    const outDir = thumbCacheDir(projectFolder, item.id)
    const thumbMissing = !(await fileExists(join(outDir, thumbFileName(item.kind))))
    const filmstripMissing =
      item.kind === 'video' && !(await fileExists(join(outDir, FILMSTRIP_FILE)))

    if (!thumbMissing && !filmstripMissing) {
      counts.cached += 1
      continue
    }
    if (thumbMissing) {
      queue.enqueue('thumbs', item.path, { outDir, mediaKind: item.kind })
      counts.queued += 1
    }
    if (filmstripMissing) {
      if (item.durationSec === undefined) {
        counts.waiting += 1
      } else {
        queue.enqueue('filmstrip', item.path, { outDir, durationSec: item.durationSec })
        counts.queued += 1
      }
    }
  }

  return counts
}
