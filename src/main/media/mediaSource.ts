// The file a media item plays from: its 720p proxy when the user chose it and it is ready, otherwise
// the original. Export never uses this; it always reads the originals.
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { playbackSource, proxyFileName } from '@shared/media/proxy'
import type { MediaRef } from '@shared/project/schema'
import { UserFacingError } from '../errors'
import { isMediaOnline, resolveMediaPath } from './mediaPaths'
import { allowSourceFile } from './sourceProtocol'

export interface MediaSource {
  url: string
  proxy: boolean
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function resolveMediaSource(
  projectFolder: string,
  media: MediaRef
): Promise<MediaSource> {
  if (!(await isMediaOnline(projectFolder, media))) {
    throw new UserFacingError('This file is offline. Relink it to play it.')
  }
  const original = resolveMediaPath(projectFolder, media)
  const proxyFile = join(projectFolder, 'cache', 'proxies', proxyFileName(media.id))
  const proxyReady = media.useProxy === true && (await exists(proxyFile))
  const file = playbackSource(media, original, proxyReady ? proxyFile : null)
  return { url: allowSourceFile(file), proxy: proxyReady }
}
