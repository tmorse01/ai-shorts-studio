// Queues a proxy for each video that needs one and has no file yet. Run on import and whenever the
// renderer asks, so a missing proxy is regenerated.
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { needsProxy, proxyFileName, averageBitrateBps, type ProxyVideo } from '@shared/media/proxy'
import type { MediaKind } from '@shared/project/schema'
import type { JobInput } from '../jobs/jobQueue'
export interface ProxyQueue {
  enqueue: (kind: 'proxy', path: string, extra: Omit<JobInput, 'path'>) => unknown
}

export interface ProxyItem {
  id: string
  path: string
  kind: MediaKind
  sizeBytes: number
  durationSec?: number
  video?: ProxyVideo
}

export interface ProxyCounts {
  queued: number
  // Proxies already on disk.
  cached: number
  // Items that do not need a proxy, or that cannot be planned without a duration.
  skipped: number
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function ensureMediaProxies(
  projectFolder: string,
  items: readonly ProxyItem[],
  queue: ProxyQueue,
  fileExists: (file: string) => Promise<boolean> = exists
): Promise<ProxyCounts> {
  const counts: ProxyCounts = { queued: 0, cached: 0, skipped: 0 }
  const proxyDir = join(projectFolder, 'cache', 'proxies')

  for (const item of items) {
    const needed =
      item.kind === 'video' &&
      item.video !== undefined &&
      item.durationSec !== undefined &&
      needsProxy(item.video, averageBitrateBps(item.sizeBytes, item.durationSec))
    if (!needed) {
      counts.skipped += 1
      continue
    }
    const outPath = join(proxyDir, proxyFileName(item.id))
    if (await fileExists(outPath)) {
      counts.cached += 1
      continue
    }
    queue.enqueue('proxy', item.path, { outPath, durationSec: item.durationSec })
    counts.queued += 1
  }

  return counts
}
