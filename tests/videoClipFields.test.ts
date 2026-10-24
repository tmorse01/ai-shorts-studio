import { describe, expect, it } from 'vitest'
import {
  setDuration,
  setSourceIn,
  setSourceOut,
  sourceWindowOf,
  videoSelectionFor
} from '@renderer/features/clip/videoClipFields'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'm1',
    startMs: 1000,
    durationMs: 4000,
    sourceInMs: 2000,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

// A main video clip from 1000 to 5000 ms, showing source 2000 to 6000 ms, with its sound on a music track.
const timeline: Timeline = {
  tracks: [
    {
      id: 'main',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [clip('v1', { linkedAudio: 'a1' })]
    },
    {
      id: 'music',
      kind: 'audio',
      role: 'music',
      muted: false,
      clips: [clip('a1')]
    }
  ]
}

function only(tl: Timeline, id: string): Clip {
  const found = tl.tracks.flatMap((track) => track.clips).find((item) => item.id === id)
  if (!found) throw new Error(`missing ${id}`)
  return found
}

describe('video selection', () => {
  it('picks one video clip and its linked audio', () => {
    const selected = videoSelectionFor(timeline, ['v1'])
    expect(selected?.clip.id).toBe('v1')
    expect(selected?.linkedAudio?.id).toBe('a1')
  })

  it('has no linked audio once the sound is detached', () => {
    const detached: Timeline = {
      tracks: [{ ...timeline.tracks[0], clips: [clip('v1')] }, timeline.tracks[1]]
    }
    expect(videoSelectionFor(detached, ['v1'])?.linkedAudio).toBeNull()
  })

  it('is empty for several clips, audio clips, and nothing selected', () => {
    expect(videoSelectionFor(timeline, ['v1', 'a1'])).toBeNull()
    expect(videoSelectionFor(timeline, ['a1'])).toBeNull()
    expect(videoSelectionFor(timeline, [])).toBeNull()
  })
})

describe('source window', () => {
  it('reads In, Out and Duration from the clip', () => {
    expect(sourceWindowOf(clip('v1'))).toEqual({ inMs: 2000, outMs: 6000, durationMs: 4000 })
  })
})

describe('source fields use the trim rules', () => {
  it('moves the start edge and the clip start together for Source In', () => {
    const edited = setSourceIn(only(timeline, 'v1'), 2500)(timeline)
    expect(only(edited, 'v1')).toMatchObject({ startMs: 1500, sourceInMs: 2500, durationMs: 3500 })
  })

  it('clamps Source In where the start handle would reach the timeline start', () => {
    // The clip starts at 1000 ms with source 2000 ms, so its start can move back to 0 at most.
    const edited = setSourceIn(only(timeline, 'v1'), -500)(timeline)
    expect(only(edited, 'v1')).toMatchObject({ startMs: 0, sourceInMs: 1000, durationMs: 5000 })
  })

  it('moves the end edge for Source Out, and stops at the source length', () => {
    const shorter = setSourceOut(only(timeline, 'v1'), 5000)(timeline)
    expect(only(shorter, 'v1').durationMs).toBe(3000)

    const capped = setSourceOut(only(timeline, 'v1'), 20_000, 8000)(timeline)
    expect(only(capped, 'v1').durationMs).toBe(6000)
  })

  it('sets Duration on the timeline and keeps at least one millisecond', () => {
    const edited = setDuration(only(timeline, 'v1'), 2500)(timeline)
    expect(only(edited, 'v1').durationMs).toBe(2500)
    const tiny = setDuration(only(timeline, 'v1'), 0)(timeline)
    expect(only(tiny, 'v1').durationMs).toBe(1)
  })

  it('keeps the linked audio on the video clip time', () => {
    const edited = setDuration(only(timeline, 'v1'), 2500)(timeline)
    expect(only(edited, 'a1')).toMatchObject({ durationMs: 2500, sourceInMs: 2000 })
  })
})
