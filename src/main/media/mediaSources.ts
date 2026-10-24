// Records where each media item's original and proxy live, so the media protocol can serve them by
// id. Paths never leave main: the renderer asks for flags and builds aism-media URLs from ids.
import { access, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { proxyFileName } from '@shared/media/proxy'
import type { MediaSourceInfo, MediaSourceRef } from '@shared/media/mediaSources'
import { resolveMediaPath } from './mediaPaths'

export interface MediaSourcePaths {
  original: string
  // Null while no proxy file exists yet.
  proxy: string | null
}

export class MediaSourceRegistry {
  private readonly entries = new Map<string, MediaSourcePaths>()

  set(mediaId: string, paths: MediaSourcePaths): void {
    this.entries.set(mediaId, paths)
  }

  get(mediaId: string): MediaSourcePaths | undefined {
    return this.entries.get(mediaId)
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Checks each item's files, records their paths in the registry, and returns the flags.
export async function describeMediaSources(
  projectFolder: string,
  media: readonly MediaSourceRef[],
  registry: MediaSourceRegistry
): Promise<MediaSourceInfo[]> {
  const root = resolve(projectFolder)
  return Promise.all(
    media.map(async (ref) => {
      const original = resolveMediaPath(root, ref)
      const proxyPath = join(root, 'cache', 'proxies', proxyFileName(ref.id))
      const hasProxy = await exists(proxyPath)
      registry.set(ref.id, { original, proxy: hasProxy ? proxyPath : null })
      return { id: ref.id, online: await isFile(original), hasProxy }
    })
  )
}
