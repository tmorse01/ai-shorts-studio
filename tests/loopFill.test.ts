import { describe, expect, it } from 'vitest'
import { loopFillClip, MAX_LOOP_COPIES, TimelineEditError } from '@shared/timeline/edits'
import { loopLayout, LOOP_CROSSFADE_MS } from '@shared/timeline/loopFill'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'song',
    startMs,
    durationMs,
    sourceInMs: 250,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

function counter(): () => string {
  let next = 0
  return () => `id${(next += 1)}`
}

function music(clips: Clip[], locked = false): Track {
  return { id: 'music', kind: 'audio', role: 'music', muted: false, locked, clips }
}

function timeline(tracks: Track[], transitions?: Timeline['transitions']): Timeline {
  return { tracks: [...tracks], ...(transitions ? { transitions } : {}) }
}

describe('loopLayout', () => {
  it('repeats the clip with a crossfade at each loop point and cuts the last copy to the end', () => {
    const { copies, transitions } = loopLayout(clip('a', 0, 4000), 10000, counter())
    expect(copies.map((item) => [item.id, item.startMs, item.durationMs])).toEqual([
      ['id1', 3500, 4000],
      ['id3', 7000, 3000]
    ])
    expect(transitions).toEqual([
      { id: 'id2', fromClipId: 'a', toClipId: 'id1', durationMs: LOOP_CROSSFADE_MS },
      { id: 'id4', fromClipId: 'id1', toClipId: 'id3', durationMs: LOOP_CROSSFADE_MS }
    ])
  })

  it('keeps the footage and source in-point of each copy, and drops linked and moment ids', () => {
    const source = clip('a', 0, 2000, { linkedAudio: 'x', momentId: 'm', label: 'Bed' })
    const { copies } = loopLayout(source, 3000, counter())
    expect(copies[0]).toMatchObject({ mediaId: 'song', sourceInMs: 250, label: 'Bed' })
    expect(copies[0]).not.toHaveProperty('linkedAudio')
    expect(copies[0]).not.toHaveProperty('momentId')
  })

  it('needs no copies when the clip already reaches the length', () => {
    expect(loopLayout(clip('a', 0, 4000), 4000, counter())).toEqual({ copies: [], transitions: [] })
    expect(loopLayout(clip('a', 0, 4000), 1000, counter()).copies).toHaveLength(0)
  })

  it('shortens the crossfade for a clip shorter than twice the crossfade', () => {
    const { copies, transitions } = loopLayout(clip('a', 0, 600), 1000, counter())
    expect(copies[0]).toMatchObject({ startMs: 300, durationMs: 600 })
    expect(transitions[0].durationMs).toBe(300)
  })

  it('makes a hard join with no transition when the clip is one millisecond long', () => {
    const { copies, transitions } = loopLayout(clip('a', 0, 1), 3, counter())
    expect(copies.map((item) => item.startMs)).toEqual([1, 2])
    expect(transitions).toEqual([])
  })
})

describe('loopFillClip', () => {
  it('adds the copies to the music track and the crossfades to the transitions', () => {
    const existing = { id: 'old', fromClipId: 'p', toClipId: 'q', durationMs: 100 }
    const result = loopFillClip(
      timeline([music([clip('a', 0, 4000)])], [existing]),
      'a',
      10000,
      counter()
    )
    const clips = result.tracks[0].clips
    expect(clips.map((item) => item.id)).toEqual(['a', 'id1', 'id3'])
    expect(result.transitions).toHaveLength(3)
    expect(result.transitions?.[0]).toEqual(existing)
  })

  it('returns the same timeline when the clip already fills the length', () => {
    const start = timeline([music([clip('a', 0, 4000)])])
    expect(loopFillClip(start, 'a', 3000, counter())).toBe(start)
  })

  it('refuses a clip that is not on the Music lane', () => {
    const start = timeline([
      { id: 'v', kind: 'video', role: 'main', muted: false, clips: [clip('a', 0, 4000)] }
    ])
    expect(() => loopFillClip(start, 'a', 10000, counter())).toThrow(TimelineEditError)
  })

  it('refuses a locked Music lane', () => {
    const start = timeline([music([clip('a', 0, 4000)], true)])
    expect(() => loopFillClip(start, 'a', 10000, counter())).toThrow(TimelineEditError)
  })

  it('refuses a loop that would add too many copies', () => {
    const start = timeline([music([clip('a', 0, 10)])])
    expect(() => loopFillClip(start, 'a', 10 * (MAX_LOOP_COPIES + 2), counter())).toThrow(
      TimelineEditError
    )
  })

  it('does not change the input timeline', () => {
    const start = timeline([music([clip('a', 0, 4000)])])
    loopFillClip(start, 'a', 10000, counter())
    expect(start.tracks[0].clips).toHaveLength(1)
    expect(start.transitions).toBeUndefined()
  })
})
