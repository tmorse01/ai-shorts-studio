import { describe, expect, it } from 'vitest'
import { musicClipAt, removeMusicClip, resizeMusicClip, splitMusicClip } from '../src/renderer/editor/music-clips'
import type { MusicClip } from '../src/shared/types'

const song: MusicClip = { id: 'a', assetId: 'track', startSec: 10, trackStartSec: 0, lengthSec: 200 }

describe('music clip split', () => {
  it('cuts a clip in two at the point, and the right piece continues from the same place in the track', () => {
    const result = splitMusicClip([song], 'a', 40, 'b')
    expect(result).not.toBeNull()
    expect(result!.rightId).toBe('b')
    const [left, right] = result!.clips
    expect(left).toEqual({ ...song, lengthSec: 30 })
    expect(right).toEqual({ id: 'b', assetId: 'track', startSec: 40, trackStartSec: 30, lengthSec: 170 })
  })

  it('refuses a split that would leave a sliver at either end', () => {
    expect(splitMusicClip([song], 'a', 10, 'b')).toBeNull()
    expect(splitMusicClip([song], 'a', 210, 'b')).toBeNull()
    expect(splitMusicClip([song], 'a', 10.01, 'b')).toBeNull()
  })

  it('does nothing for a clip that is not in the list', () => {
    expect(splitMusicClip([song], 'missing', 40, 'b')).toBeNull()
  })

  it('keeps the other clips as they are', () => {
    const other: MusicClip = { id: 'c', assetId: 'x', startSec: 0, trackStartSec: 0, lengthSec: 5 }
    const result = splitMusicClip([other, song], 'a', 40, 'b')
    expect(result!.clips[0]).toBe(other)
    expect(result!.clips).toHaveLength(3)
  })
})

describe('music clip lookup and delete', () => {
  it('finds the clip under a point on the timeline', () => {
    expect(musicClipAt([song], 50)?.id).toBe('a')
    expect(musicClipAt([song], 5)).toBeNull()
    expect(musicClipAt([song], 210)).toBeNull()
  })

  it('removes one clip by id', () => {
    const other: MusicClip = { id: 'c', assetId: 'x', startSec: 0, trackStartSec: 0, lengthSec: 5 }
    expect(removeMusicClip([song, other], 'a')).toEqual([other])
  })
})

describe('music clip resize', () => {
  // A 60 s clip from 30 s into a 200 s track, placed at 10 s on the timeline.
  const clip: MusicClip = { id: 'a', assetId: 'track', startSec: 10, trackStartSec: 30, lengthSec: 60 }

  it('extends the end into the rest of the track', () => {
    expect(resizeMusicClip(clip, 'end', 20, 200).lengthSec).toBe(80)
  })

  it('stops the end at the end of the track', () => {
    expect(resizeMusicClip(clip, 'end', 500, 200).lengthSec).toBe(170)
  })

  it('shortens the end but never to a sliver', () => {
    expect(resizeMusicClip(clip, 'end', -500, 200).lengthSec).toBeCloseTo(0.05, 5)
  })

  it('moves the start edge and the in-point together, so the music stays in place', () => {
    const next = resizeMusicClip(clip, 'start', -5, 200)
    expect(next).toEqual({ ...clip, startSec: 5, trackStartSec: 25, lengthSec: 65 })
  })

  it('stops the start edge at the start of the timeline, or the track, whichever comes first', () => {
    // The clip starts 10 s into the short and 30 s into the track, so it can only move 10 s earlier.
    const next = resizeMusicClip(clip, 'start', -500, 200)
    expect(next.startSec).toBe(0)
    expect(next.trackStartSec).toBe(20)
    expect(next.lengthSec).toBe(70)
  })

  it('does not let the start edge pass the end of the clip', () => {
    const next = resizeMusicClip(clip, 'start', 500, 200)
    expect(next.lengthSec).toBeCloseTo(0.05, 5)
  })

  it('leaves the clip alone when the track length is unknown', () => {
    expect(resizeMusicClip(clip, 'end', 10, 0)).toBe(clip)
  })
})
