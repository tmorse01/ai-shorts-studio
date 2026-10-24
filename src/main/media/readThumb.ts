// Reads one cached thumbnail, filmstrip or waveform for the renderer as a data URL. A missing or
// unreadable file is not an error: the renderer shows the clip without it until the job finishes.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ThumbReadFile } from '@shared/media/thumbs'
import { thumbCacheDir } from './thumbnails'

const MIME: Record<ThumbReadFile, string> = {
  'poster.jpg': 'image/jpeg',
  'thumb.jpg': 'image/jpeg',
  'filmstrip.jpg': 'image/jpeg',
  'waveform.png': 'image/png'
}

export async function readThumbDataUrl(
  projectFolder: string,
  mediaId: string,
  file: ThumbReadFile
): Promise<{ dataUrl: string | null }> {
  try {
    const bytes = await readFile(join(thumbCacheDir(projectFolder, mediaId), file))
    return { dataUrl: `data:${MIME[file]};base64,${bytes.toString('base64')}` }
  } catch {
    return { dataUrl: null }
  }
}
