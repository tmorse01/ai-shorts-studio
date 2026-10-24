import { describe, expect, it } from 'vitest'
import {
  addTransition,
  assertMainNoOverlap,
  closeGap,
  deleteClip,
  detachAudio,
  insertClip,
  moveClip,
  removeTransition,
  resizeTransition,
  splitClip,
  TimelineEditError,
  trimClip
} from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

function clip(id: string, startMs: number, durationMs: number, sourceInMs = 0): Clip {
  return { id, mediaId: 'media_1', startMs, durationMs, sourceInMs, transform: IDENTITY_TRANSFORM }
}

function track(
  id: string,
  role: Track['role'],
  clips: Clip[],
  kind: Track['kind'] = 'video'
): Track {
  return { id, kind, role, muted: false, clips }
}

// A main track of three clips with a gap between the second and third: 0-1000, 1000-2000, 3000-4000.
function sequence(): Timeline {
  return {
    tracks: [
      track('main', 'main', [
        clip('a', 0, 1000, 500),
        clip('b', 1000, 1000),
        clip('c', 3000, 1000)
      ]),
      track('over', 'overlay', [clip('o', 500, 800)]),
      track('music', 'music', [], 'audio')
    ]
  }
}

function starts(timeline: Timeline, trackId: string): Array<[string, number, number]> {
  const found = timeline.tracks.find((item) => item.id === trackId)
  return [...(found?.clips ?? [])]
    .sort((a, b) => a.startMs - b.startMs)
    .map((item) => [item.id, item.startMs, item.durationMs])
}

describe('insertClip', () => {
  it('ripples later main clips right by the inserted length', () => {
    const result = insertClip(sequence(), 'main', clip('x', 0, 500), 1000)
    expect(starts(result, 'main')).toEqual([
      ['a', 0, 1000],
      ['x', 1000, 500],
      ['b', 1500, 1000],
      ['c', 3500, 1000]
    ])
  })

  it('places an overlay clip freely, with no shifting', () => {
    const result = insertClip(sequence(), 'over', clip('x', 100, 300), 100)
    expect(starts(result, 'over')).toEqual([
      ['x', 100, 300],
      ['o', 500, 800]
    ])
  })

  it('refuses to insert inside a main clip', () => {
    expect(() => insertClip(sequence(), 'main', clip('x', 0, 100), 500)).toThrow(TimelineEditError)
  })

  it('does not change the input timeline', () => {
    const before = sequence()
    insertClip(before, 'main', clip('x', 0, 500), 0)
    expect(before).toEqual(sequence())
  })
})

describe('moveClip', () => {
  it('moves a free-layer clip to a new start', () => {
    expect(starts(moveClip(sequence(), 'o', 'over', 0), 'over')).toEqual([['o', 0, 800]])
  })

  it('refuses to move a main clip onto another main clip', () => {
    expect(() => moveClip(sequence(), 'c', 'main', 500)).toThrow(TimelineEditError)
  })

  it('moves a clip to the end of the timeline when it does not overlap', () => {
    expect(starts(moveClip(sequence(), 'c', 'main', 4000), 'main')).toContainEqual([
      'c',
      4000,
      1000
    ])
  })

  it('moves a clip from one track to another', () => {
    const result = moveClip(sequence(), 'o', 'music', 0)
    expect(starts(result, 'over')).toEqual([])
    expect(starts(result, 'music')).toEqual([['o', 0, 800]])
  })
})

describe('trimClip', () => {
  it('shortens the end of a clip', () => {
    expect(starts(trimClip(sequence(), 'a', 'end', 600), 'main')[0]).toEqual(['a', 0, 600])
  })

  it('will not extend a main clip into the next one', () => {
    expect(starts(trimClip(sequence(), 'a', 'end', 5000), 'main')[0]).toEqual(['a', 0, 1000])
  })

  it('will not extend past the source length', () => {
    // The clip plays source from 0, so a 1300 ms source allows it to run to 1300 ms long.
    const result = trimClip(sequence(), 'o', 'end', 5000, 1300)
    expect(starts(result, 'over')[0]).toEqual(['o', 500, 1300])
  })

  it('moves the start and keeps the end, shifting sourceIn by the same amount', () => {
    const result = trimClip(sequence(), 'a', 'start', 200)
    const trimmed = result.tracks[0].clips[0]
    expect(trimmed).toMatchObject({ startMs: 200, durationMs: 800, sourceInMs: 700 })
  })

  it('will not trim the start before the source begins', () => {
    const result = trimClip(sequence(), 'a', 'start', 0)
    expect(result.tracks[0].clips[0]).toMatchObject({
      startMs: 0,
      durationMs: 1000,
      sourceInMs: 500
    })
  })

  it('keeps at least one frame of length when trimmed to nothing', () => {
    const result = trimClip(sequence(), 'b', 'end', 1000)
    expect(result.tracks[0].clips[1].durationMs).toBe(1)
  })
})

describe('splitClip', () => {
  it('splits a clip into two that together cover the original, with sourceIn advanced', () => {
    const result = splitClip(sequence(), 'a', 300, 'a2')
    expect(starts(result, 'main').slice(0, 3)).toEqual([
      ['a', 0, 300],
      ['a2', 300, 700],
      ['b', 1000, 1000]
    ])
    expect(result.tracks[0].clips[1].sourceInMs).toBe(500 + 300)
  })

  it('refuses a split at the very start or end of the clip', () => {
    expect(() => splitClip(sequence(), 'a', 0, 'x')).toThrow(TimelineEditError)
    expect(() => splitClip(sequence(), 'a', 1000, 'x')).toThrow(TimelineEditError)
  })
})

describe('deleteClip', () => {
  it('removes the clip and leaves a gap', () => {
    expect(starts(deleteClip(sequence(), 'b'), 'main')).toEqual([
      ['a', 0, 1000],
      ['c', 3000, 1000]
    ])
  })

  it('removes transitions that used the deleted clip', () => {
    const withTransition = addTransition(sequence(), {
      id: 't1',
      fromClipId: 'a',
      toClipId: 'b',
      durationMs: 200
    })
    expect(deleteClip(withTransition, 'b').transitions).toEqual([])
  })
})

describe('closeGap', () => {
  it('closes the gap after the clip before it', () => {
    const result = closeGap(sequence(), 'main', 2500)
    expect(starts(result, 'main')[2]).toEqual(['c', 2000, 1000])
  })

  it('does nothing when there is no clip after the gap', () => {
    expect(closeGap(sequence(), 'main', 5000)).toEqual(sequence())
  })

  it('refuses a point inside a clip', () => {
    expect(() => closeGap(sequence(), 'main', 500)).toThrow(TimelineEditError)
  })

  it('closes a gap at time zero', () => {
    const leading: Timeline = {
      tracks: [track('main', 'main', [clip('a', 700, 1000)])]
    }
    expect(starts(closeGap(leading, 'main', 0), 'main')).toEqual([['a', 0, 1000]])
  })
})

describe('transitions', () => {
  const join = { id: 't1', fromClipId: 'a', toClipId: 'b', durationMs: 200 }

  it('adds, resizes and removes a transition between two clips on one track', () => {
    const added = addTransition(sequence(), join)
    expect(added.transitions).toEqual([join])
    expect(resizeTransition(added, 't1', 400).transitions?.[0].durationMs).toBe(400)
    expect(removeTransition(added, 't1').transitions).toEqual([])
  })

  it('refuses clips on different tracks, a reversed pair, or a bad length', () => {
    expect(() => addTransition(sequence(), { ...join, toClipId: 'o' })).toThrow(TimelineEditError)
    expect(() => addTransition(sequence(), { ...join, fromClipId: 'b', toClipId: 'a' })).toThrow(
      TimelineEditError
    )
    expect(() => resizeTransition(addTransition(sequence(), join), 't1', 0)).toThrow(
      TimelineEditError
    )
  })
})

describe('detachAudio', () => {
  it('copies the clip to an audio track and links it back', () => {
    const result = detachAudio(sequence(), 'a', 'music', 'a-audio')
    expect(starts(result, 'music')).toEqual([['a-audio', 0, 1000]])
    expect(result.tracks[0].clips[0].linkedAudio).toBe('a-audio')
  })

  it('refuses a track that is not audio', () => {
    expect(() => detachAudio(sequence(), 'a', 'over', 'x')).toThrow(TimelineEditError)
  })
})

describe('main track invariant', () => {
  it('reports overlapping clips on the main track and ignores overlaps on free layers', () => {
    const broken: Timeline = {
      tracks: [track('main', 'main', [clip('a', 0, 1000), clip('b', 500, 1000)])]
    }
    expect(() => assertMainNoOverlap(broken)).toThrow(TimelineEditError)
    expect(() => assertMainNoOverlap(sequence())).not.toThrow()
  })
})
