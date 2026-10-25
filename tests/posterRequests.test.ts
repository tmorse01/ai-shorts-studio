import { describe, expect, it, vi } from 'vitest'
import type { MediaRef, Short } from '@shared/project/schema'
import { IDENTITY_TRANSFORM } from '@shared/timeline/timeline'
import { posterFileName } from '@shared/shorts/poster'
import {
  posterRequestsFor,
  posterSrcFor,
  queueShortPoster
} from '@renderer/features/shorts/posterRequests'

const NOW = '2026-10-25T10:00:00.000Z'

const media = [{ id: 'vid1', path: 'clip.mp4', pathKind: 'relative' }] as unknown as MediaRef[]

function shortWithPoster(posterMs: number | undefined): Short {
  return {
    id: 'short1',
    name: 'Short 1',
    createdAt: NOW,
    updatedAt: NOW,
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    posterMs,
    timeline: {
      tracks: [
        {
          id: 'v1',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            {
              id: 'c1',
              mediaId: 'vid1',
              startMs: 0,
              durationMs: 10000,
              sourceInMs: 500,
              transform: IDENTITY_TRANSFORM
            }
          ]
        }
      ]
    }
  } as unknown as Short
}

describe('Set as poster queues the poster job', () => {
  it('sends the frame under the new poster time to the queue', async () => {
    const queue = vi.fn(async () => ({ ok: true }))
    await queueShortPoster(queue, '/projects/p1', shortWithPoster(3000), media)

    expect(queue).toHaveBeenCalledTimes(1)
    expect(queue).toHaveBeenCalledWith('/projects/p1', [
      {
        shortId: 'short1',
        mediaId: 'vid1',
        sourceTimeMs: 3500,
        path: 'clip.mp4',
        pathKind: 'relative'
      }
    ])
  })

  it('queues no frame when the short has no video clip', async () => {
    const queue = vi.fn(async () => ({ ok: true }))
    const short = { ...shortWithPoster(0), timeline: { tracks: [] } } as unknown as Short
    await queueShortPoster(queue, '/projects/p1', short, media)
    expect(queue).toHaveBeenCalledWith('/projects/p1', [])
  })
})

describe('moving the poster invalidates the poster URL', () => {
  it('changes the frame file, so the old image is no longer named', () => {
    const before = posterRequestsFor([shortWithPoster(0)], media)[0]
    const after = posterRequestsFor([shortWithPoster(4000)], media)[0]

    expect(posterFileName(after)).not.toBe(posterFileName(before))
    expect(posterSrcFor(after, 1)).not.toBe(posterSrcFor(before, 1))
    expect(posterSrcFor(after, 1)).toBe('aism-media://poster/short1/vid1-4500.jpg?v=1')
  })

  it('finds no request for a short whose footage is gone from the project', () => {
    expect(posterRequestsFor([shortWithPoster(0)], [])).toEqual([])
  })
})
