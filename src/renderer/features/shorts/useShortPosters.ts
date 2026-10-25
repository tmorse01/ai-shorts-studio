// Keeps each short's poster in step with the project: asks main to render any missing frame, checks
// whether each frame is rendered, and points the card at its protocol URL. A new frame drops the old
// image at once, and each finished poster job re-checks the frames, so a card updates without a reload.
import { useEffect, useState } from 'react'
import type { MediaRef, Short } from '@shared/project/schema'
import { toast } from '../toasts/toast'
import {
  posterRequestsFor,
  frameOf,
  posterSrcFor,
  type PosterRequest,
  type PosterView
} from './posterRequests'

export type PosterViews = Record<string, PosterView>

// The poster view of each short, by short id. A short missing from the result has no poster request
// and shows the empty state.
export function useShortPosters(
  folderPath: string | null,
  shorts: readonly Short[],
  media: readonly MediaRef[]
): PosterViews {
  const [views, setViews] = useState<PosterViews>({})
  // The requests are serialised so the effect depends on their content, not on new array objects.
  const signature = JSON.stringify(posterRequestsFor(shorts, media))

  useEffect(() => {
    if (folderPath === null) return undefined
    const requests = JSON.parse(signature) as PosterRequest[]
    let alive = true
    // A changed frame invalidates the old image: every request starts as loading until it is checked.
    setViews(
      Object.fromEntries(requests.map((r) => [r.shortId, { status: 'loading' } as PosterView]))
    )

    const checkAll = async (): Promise<void> => {
      const entries = await Promise.all(
        requests.map(async (request): Promise<[string, PosterView]> => {
          const result = await window.api.invoke('media:poster:read', {
            projectFolder: folderPath,
            frame: frameOf(request)
          })
          if (!result.ok) return [request.shortId, { status: 'empty' }]
          if (!result.data.rendered) return [request.shortId, { status: 'loading' }]
          return [request.shortId, { status: 'ready', src: posterSrcFor(request, Date.now()) }]
        })
      )
      if (alive) setViews(Object.fromEntries(entries))
    }

    const queueMissing = async (): Promise<void> => {
      const result = await window.api.invoke('media:posters', {
        projectFolder: folderPath,
        items: requests
      })
      if (result.ok) return
      if (alive) {
        setViews(
          Object.fromEntries(requests.map((r) => [r.shortId, { status: 'empty' } as PosterView]))
        )
        toast.error({
          title: 'Could not make poster frames',
          description: result.error.message,
          details: result.error.details
        })
      }
    }

    void queueMissing().then(checkAll)
    const unsubscribe = window.api.on('media:job:changed', (job) => {
      if (job.kind !== 'poster') return
      if (job.status === 'done') void checkAll()
      if (job.status === 'failed') {
        // A frame still unrendered after a failed job has no image coming: show the empty state, not a spinner.
        void checkAll().then(() => {
          if (!alive) return
          setViews((previous) =>
            Object.fromEntries(
              Object.entries(previous).map(([id, view]) => [
                id,
                view.status === 'loading' ? { status: 'empty' } : view
              ])
            )
          )
        })
      }
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [folderPath, signature])

  return views
}
