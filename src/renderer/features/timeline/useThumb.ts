// Loads one cached thumbnail, filmstrip or waveform for a clip through the media:thumb:read channel.
// Results are shared by every clip that shows the same file. A missing file is not cached, so a
// clip picks it up once the thumbs job has written it.
import { useEffect, useState } from 'react'
import type { ThumbReadFile } from '@shared/media/thumbs'

export interface ThumbImage {
  src: string
  // Natural size of the image. A filmstrip needs it to size its frames.
  width: number
  height: number
}

const cache = new Map<string, Promise<ThumbImage | null>>()

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Thumbnail did not decode'))
    image.src = src
  })
}

export function loadThumb(
  projectFolder: string,
  mediaId: string,
  file: ThumbReadFile
): Promise<ThumbImage | null> {
  const key = `${projectFolder}|${mediaId}|${file}`
  const cached = cache.get(key)
  if (cached) return cached

  const pending = window.api
    .invoke('media:thumb:read', { projectFolder, mediaId, file })
    .then(async (result): Promise<ThumbImage | null> => {
      if (!result.ok || result.data.dataUrl === null) return null
      const src = result.data.dataUrl
      const size = await measure(src)
      return { src, ...size }
    })
    .catch((): ThumbImage | null => null)
    .then((value) => {
      if (value === null) cache.delete(key)
      return value
    })

  cache.set(key, pending)
  return pending
}

// The thumbnail for a clip, or null while it loads or when there is none. Pass undefined for any
// argument that has nothing to load (no media, offline media, or no file of this kind).
export function useThumb(
  projectFolder: string | undefined,
  mediaId: string | undefined,
  file: ThumbReadFile | undefined
): ThumbImage | null {
  const [thumb, setThumb] = useState<ThumbImage | null>(null)

  useEffect(() => {
    if (!projectFolder || !mediaId || !file) {
      setThumb(null)
      return undefined
    }
    let alive = true
    void loadThumb(projectFolder, mediaId, file).then((value) => {
      if (alive) setThumb(value)
    })
    return () => {
      alive = false
    }
  }, [projectFolder, mediaId, file])

  return thumb
}
