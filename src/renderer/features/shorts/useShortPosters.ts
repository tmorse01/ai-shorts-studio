// Keeps each short's poster frame in step with the project: asks main to render any missing frame,
// reads the cached frames back as data URLs, and reads them again when a poster job finishes, so a
// card updates as soon as its poster is ready.
import { useEffect, useState } from 'react'
import type { MediaRef, Short } from '@shared/project/schema'
import { posterTarget, type PosterFrameRef } from '@shared/shorts/poster'
import { toast } from '../toasts/toast'

export type PosterImages = Record<string, string>

interface PosterRequest extends PosterFrameRef {
  path: string
  pathKind: MediaRef['pathKind']
}

// The frame each short shows, with the footage file it comes from. Shorts with no video clip, or
// whose footage is no longer in the project, have no request and keep the placeholder.
function requestsFor(shorts: readonly Short[], media: readonly MediaRef[]): PosterRequest[] {
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

// The poster data URL for each short, by short id. A short is missing from the result until its
// frame is rendered.
export function useShortPosters(
  folderPath: string | null,
  shorts: readonly Short[],
  media: readonly MediaRef[]
): PosterImages {
  const [images, setImages] = useState<PosterImages>({})
  // The requests are serialised so the effect depends on their content, not on new array objects.
  const signature = JSON.stringify(requestsFor(shorts, media))

  useEffect(() => {
    if (folderPath === null) return undefined
    const requests = JSON.parse(signature) as PosterRequest[]
    let alive = true

    const readAll = async (): Promise<void> => {
      const entries = await Promise.all(
        requests.map(async (request): Promise<[string, string] | null> => {
          const result = await window.api.invoke('media:poster:read', {
            projectFolder: folderPath,
            frame: {
              shortId: request.shortId,
              mediaId: request.mediaId,
              sourceTimeMs: request.sourceTimeMs
            }
          })
          return result.ok && result.data.dataUrl !== null
            ? [request.shortId, result.data.dataUrl]
            : null
        })
      )
      if (!alive) return
      const next: PosterImages = {}
      for (const entry of entries) if (entry) next[entry[0]] = entry[1]
      setImages(next)
    }

    const queueMissing = async (): Promise<void> => {
      const result = await window.api.invoke('media:posters', {
        projectFolder: folderPath,
        items: requests
      })
      if (!result.ok && alive) {
        toast.error({
          title: 'Could not make poster frames',
          description: result.error.message,
          details: result.error.details
        })
      }
    }

    void queueMissing().then(readAll)
    const unsubscribe = window.api.on('media:job:changed', (job) => {
      if (job.kind === 'poster' && job.status === 'done') void readAll()
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [folderPath, signature])

  return images
}
