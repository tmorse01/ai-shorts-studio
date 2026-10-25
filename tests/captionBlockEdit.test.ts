import { describe, expect, it } from 'vitest'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import { editCaptionBlocks } from '@shared/captions/captionTrack'
import { moveCaptionBlock } from '@shared/captions/captionEditing'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'

function timelineWith(captions: CaptionBlock[] | undefined, locked = false): Timeline {
  const clip = {
    id: 'a',
    startMs: 0,
    durationMs: 1000,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM
  }
  return {
    tracks: [
      { id: 'main', kind: 'video', role: 'main', muted: false, clips: [clip] },
      {
        id: 'cap',
        kind: 'text',
        role: 'captions',
        muted: false,
        locked,
        clips: [],
        captions
      }
    ]
  } as unknown as Timeline
}

const CAPTIONS: CaptionBlock[] = [
  { id: 'c1', words: [{ text: 'hi', startMs: 0, endMs: 300 }] },
  { id: 'c2', words: [{ text: 'there', startMs: 500, endMs: 800 }] }
]

describe('editCaptionBlocks', () => {
  it('applies the update to the captions track only', () => {
    const timeline = timelineWith(CAPTIONS)
    const next = editCaptionBlocks(timeline, (blocks) => moveCaptionBlock(blocks, 'c2', 100))
    const captions = next.tracks.find((track) => track.role === 'captions')?.captions
    expect(captions?.[1].words[0]).toEqual({ text: 'there', startMs: 600, endMs: 900 })
    expect(next.tracks.find((track) => track.role === 'main')).toBe(timeline.tracks[0])
  })

  it('returns the same timeline when the update changes nothing', () => {
    const timeline = timelineWith(CAPTIONS)
    expect(editCaptionBlocks(timeline, (blocks) => blocks as CaptionBlock[])).toBe(timeline)
  })

  it('treats a track with no captions as empty', () => {
    const timeline = timelineWith(undefined)
    expect(editCaptionBlocks(timeline, (blocks) => blocks as CaptionBlock[])).toBe(timeline)
  })

  it('throws when the short has no captions track', () => {
    const timeline = { tracks: [] } as unknown as Timeline
    expect(() => editCaptionBlocks(timeline, (blocks) => [...blocks])).toThrow(
      'The short has no captions track.'
    )
  })

  it('throws when the captions track is locked', () => {
    const timeline = timelineWith(CAPTIONS, true)
    expect(() => editCaptionBlocks(timeline, (blocks) => [...blocks])).toThrow(
      'The captions track is locked.'
    )
  })
})
