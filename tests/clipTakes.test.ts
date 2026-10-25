import { describe, expect, it } from 'vitest'
import { setClipLocked, swapClipAlternative, TimelineEditError } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'
import { applyAssemblyPlan } from '@shared/assembly/assemblyPlan'

function assembledClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    mediaId: 'm1',
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 1000,
    transform: { ...IDENTITY_TRANSFORM },
    assembly: {
      lineId: 'line_1',
      alternatives: [
        { sourceId: 'm2', inMs: 0, outMs: 5000 },
        { sourceId: 'm3', inMs: 4000, outMs: 4800 }
      ]
    },
    ...overrides
  }
}

function timelineWith(clips: Clip[], extra: Partial<Timeline> = {}): Timeline {
  return {
    tracks: [{ id: 'v1', kind: 'video', role: 'main', muted: false, clips }],
    ...extra
  }
}

function clipOf(timeline: Timeline, id: string): Clip {
  const clip = timeline.tracks.flatMap((track) => track.clips).find((item) => item.id === id)
  if (!clip) throw new Error(`no clip ${id}`)
  return clip
}

describe('swapClipAlternative', () => {
  it('plays the alternative from its in point and keeps the slot length when the take is long enough', () => {
    const next = swapClipAlternative(timelineWith([assembledClip()]), 'c1', 0)
    const clip = clipOf(next, 'c1')
    expect(clip.mediaId).toBe('m2')
    expect(clip.sourceInMs).toBe(0)
    expect(clip.durationMs).toBe(2000)
  })

  it('shortens the clip when the alternative is shorter than the slot', () => {
    const next = swapClipAlternative(timelineWith([assembledClip()]), 'c1', 1)
    const clip = clipOf(next, 'c1')
    expect(clip.mediaId).toBe('m3')
    expect(clip.sourceInMs).toBe(4000)
    expect(clip.durationMs).toBe(800)
  })

  it('puts the current take in the swapped slot, so swapping back restores the clip', () => {
    const start = timelineWith([assembledClip()])
    const once = swapClipAlternative(start, 'c1', 0)
    const twice = swapClipAlternative(once, 'c1', 0)
    expect(clipOf(once, 'c1').assembly?.alternatives[0]).toEqual({
      sourceId: 'm1',
      inMs: 1000,
      outMs: 3000
    })
    expect(clipOf(twice, 'c1')).toMatchObject({
      mediaId: 'm1',
      sourceInMs: 1000,
      durationMs: 2000
    })
  })

  it('moves linked audio to the same source', () => {
    const video = assembledClip({ linkedAudio: 'a1' })
    const audio: Clip = {
      id: 'a1',
      mediaId: 'm1',
      startMs: 0,
      durationMs: 2000,
      sourceInMs: 1000,
      transform: { ...IDENTITY_TRANSFORM }
    }
    const timeline: Timeline = {
      tracks: [
        { id: 'v1', kind: 'video', role: 'main', muted: false, clips: [video] },
        { id: 'a', kind: 'audio', role: 'narration', muted: false, clips: [audio] }
      ]
    }
    const next = swapClipAlternative(timeline, 'c1', 0)
    expect(clipOf(next, 'a1')).toMatchObject({ mediaId: 'm2', sourceInMs: 0, durationMs: 2000 })
  })

  it('refuses an index with no alternative', () => {
    expect(() => swapClipAlternative(timelineWith([assembledClip()]), 'c1', 2)).toThrow(
      TimelineEditError
    )
    expect(() => swapClipAlternative(timelineWith([assembledClip()]), 'c1', -1)).toThrow(
      TimelineEditError
    )
  })

  it('refuses a clip with no assembly', () => {
    const plain = assembledClip({ assembly: undefined })
    expect(() => swapClipAlternative(timelineWith([plain]), 'c1', 0)).toThrow(TimelineEditError)
  })

  it('refuses a swap on a locked track', () => {
    const timeline = timelineWith([assembledClip()])
    timeline.tracks[0].locked = true
    expect(() => swapClipAlternative(timeline, 'c1', 0)).toThrow(TimelineEditError)
  })
})

describe('setClipLocked', () => {
  it('locks and unlocks one clip', () => {
    const locked = setClipLocked(timelineWith([assembledClip()]), 'c1', true)
    expect(clipOf(locked, 'c1').locked).toBe(true)
    const unlocked = setClipLocked(locked, 'c1', false)
    expect(clipOf(unlocked, 'c1').locked).toBe(false)
  })

  it('keeps a locked clip when an assembly plan is applied again', () => {
    const locked = setClipLocked(timelineWith([assembledClip()]), 'c1', true)
    const next = applyAssemblyPlan(
      locked,
      { lines: [{ lineId: 'line_1', cuts: [] }] },
      {
        trackId: 'v1',
        newId: () => 'new'
      }
    )
    expect(clipOf(next, 'c1').locked).toBe(true)
  })

  it('refuses a change on a locked track', () => {
    const timeline = timelineWith([assembledClip()])
    timeline.tracks[0].locked = true
    expect(() => setClipLocked(timeline, 'c1', true)).toThrow(TimelineEditError)
  })
})
