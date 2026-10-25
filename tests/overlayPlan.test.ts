import { describe, expect, it } from 'vitest'
import { planOverlays } from '@shared/render/overlayPlan'
import type { Clip, Timeline } from '@shared/timeline/timeline'
import type { TextItem } from '@shared/text/textItem'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return { id, startMs: 0, durationMs: 2000, sourceInMs: 0, transform: IDENTITY, ...extra }
}

const textItem = { text: 'Hi', styleId: 'display', x: 0.5, y: 0.5, scale: 1 } as TextItem

// A video clip, a text clip, an image overlay, and a caption block on a captions track.
const timeline: Timeline = {
  tracks: [
    {
      id: 'main',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [clip('v1', { mediaId: 'cam' })]
    },
    { id: 'text', kind: 'text', role: 'text', muted: false, clips: [clip('t1', { textItem })] },
    {
      id: 'overlay',
      kind: 'overlay',
      role: 'overlay',
      muted: false,
      clips: [clip('i1', { mediaId: 'logo', imageItem: {} })]
    },
    {
      id: 'captions',
      kind: 'text',
      role: 'captions',
      muted: false,
      clips: [],
      captions: [{ id: 'b1', words: [{ text: 'Hello', startMs: 0, endMs: 500 }] }]
    }
  ]
}

describe('planOverlays', () => {
  it('routes text and caption layers to ASS and image overlays to still inputs', () => {
    expect(planOverlays(timeline)).toEqual([
      { kind: 'ass', key: 't1', source: 'text', trackId: 'text' },
      { kind: 'still-input', key: 'i1', mediaId: 'logo', trackId: 'overlay' },
      { kind: 'ass', key: 'b1', source: 'caption', trackId: 'captions' }
    ])
  })

  it('leaves video clips out of the plan', () => {
    expect(planOverlays(timeline).some((entry) => entry.key === 'v1')).toBe(false)
  })

  it('has no entries for a timeline with no overlays', () => {
    expect(planOverlays({ tracks: [] })).toEqual([])
  })
})
