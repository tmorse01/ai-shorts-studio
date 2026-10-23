import { describe, expect, it } from 'vitest'
import { snapDelta, snapTime } from '../src/shared/timeline-math'
import {
  deleteCuts,
  laneRoom,
  moveCut,
  placeNewCut,
  snapTargets,
  splitCut,
  trimCut
} from '../src/renderer/editor/timeline-model'
import type { TimelineCut } from '../src/shared/timeline'
import { clampResizeDelta, moveMusicClips, neighbourBounds } from '../src/renderer/editor/music-clips'
import type { MusicClip } from '../src/shared/types'

const clip = (id: string, startSec: number, lengthSec: number, trackStartSec = 0): MusicClip => ({
  id,
  assetId: 'track',
  startSec,
  trackStartSec,
  lengthSec
})

describe('snapping', () => {
  it('locks to a target inside the threshold and leaves the time alone outside it', () => {
    expect(snapTime(10.2, [10, 20], 0.5)).toBe(10)
    expect(snapTime(12, [10, 20], 0.5)).toBe(12)
  })

  it('picks the nearest of several targets', () => {
    expect(snapTime(10.4, [10, 10.6], 1)).toBe(10.6)
  })

  it('snaps a moving edge and returns the adjusted delta', () => {
    // The clip's start is at 5 and the drag would take it to 9.8, which is close to a target at 10.
    expect(snapDelta([5], 4.8, [10], 0.5)).toBeCloseTo(5, 5)
  })

  it('keeps the delta when nothing is close', () => {
    expect(snapDelta([5], 2, [10], 0.5)).toBe(2)
  })

  it('snaps whichever of two points is closer to a target', () => {
    // The start would land at 6.6, which is nowhere near 10. The end would land at 9.6, which is.
    expect(snapDelta([3, 6], 3.6, [10], 0.5)).toBeCloseTo(4, 5)
  })
})

describe('snap targets', () => {
  const cut: TimelineCut = { startSec: 0, endSec: 4, atSec: 0 }

  it('includes the timeline start and end, the playhead, and every cut and clip edge', () => {
    const targets = snapTargets([cut], [clip('a', 6, 2)], 5, 30)
    expect(targets).toEqual(expect.arrayContaining([0, 30, 0, 4, 6, 8, 5]))
  })

  it('leaves out the playhead when there is none', () => {
    expect(snapTargets([cut], [], null, 30)).toEqual([0, 30, 0, 4])
  })
})

describe('video cut placement', () => {
  const cuts: TimelineCut[] = [
    { startSec: 10, endSec: 20, atSec: 0 },
    { startSec: 30, endSec: 40, atSec: 15 }
  ]

  it('moves a cut along the timeline without changing its footage', () => {
    const moved = moveCut(cuts, 0, 3, 30)
    expect(moved[0]).toEqual({ startSec: 10, endSec: 20, atSec: 3 })
    expect(moved[1]).toEqual(cuts[1])
  })

  it('stops a moved cut at its neighbours and at the end of the short', () => {
    expect(moveCut(cuts, 0, 100, 30)[0].atSec).toBe(5) // stops where the second cut starts (15), minus its length
    expect(moveCut(cuts, 1, 100, 30)[1].atSec).toBe(20) // stops at the short's end, 30 minus its 10 s length
    expect(moveCut(cuts, 0, -100, 30)[0].atSec).toBe(0)
  })

  it('leaves blank space between cuts alone when a cut moves', () => {
    const gapped = [
      { startSec: 10, endSec: 20, atSec: 0 },
      { startSec: 30, endSec: 40, atSec: 20 }
    ]
    expect(moveCut(gapped, 0, 2, 30)[0].atSec).toBe(2)
  })

  it('trims the start and keeps the end where it is on the timeline', () => {
    const trimmed = trimCut(cuts, 1, 'start', 4, 100, 30)
    // The start moves 4 s into the cut, so the cut loses 4 s from its left and its place moves 4 s right.
    expect(trimmed[1]).toEqual({ startSec: 34, endSec: 40, atSec: 19 })
    // The cut still ends at 25 s on the timeline, as it did before the trim.
    expect(trimmed[1].atSec + (trimmed[1].endSec - trimmed[1].startSec)).toBe(25)
  })

  it('trims the end and keeps the start where it is on the timeline', () => {
    const trimmed = trimCut(cuts, 0, 'end', -3, 100, 30)
    expect(trimmed[0]).toEqual({ startSec: 10, endSec: 17, atSec: 0 })
  })

  it('never trims past the footage, the minimum length, the neighbours or the short', () => {
    // The first cut starts at 0 on the timeline, so its start cannot move earlier at all.
    expect(trimCut(cuts, 0, 'start', -50, 100, 30)[0].startSec).toBe(10)
    // The start can move in as far as the minimum length allows: 10 s less 0.5 s.
    expect(trimCut(cuts, 0, 'start', 50, 100, 30)[0].startSec).toBeCloseTo(19.5, 5)
    // The end can run out until the next cut starts (15 s on the timeline, 5 s after this cut's end).
    expect(trimCut(cuts, 0, 'end', 50, 100, 30)[0].endSec).toBe(25)
    // With no next cut, the end runs out at the short's length (30 s on the timeline).
    expect(trimCut([cuts[0]], 0, 'end', 50, 100, 30)[0].endSec).toBe(40)
  })

  it('reports the room a cut has on the timeline', () => {
    expect(laneRoom(cuts, 0)).toEqual({ left: 0, right: 15 })
    expect(laneRoom(cuts, 1)).toEqual({ left: 10, right: Infinity })
  })

  it('places a new cut at the playhead when that space is free, and elsewhere when it is not', () => {
    const seg = { startSec: 0, endSec: 4 }
    // Free space is 10–15 s and 25–30 s. At 22 s a 4 s cut does not fit before the next cut, so it goes to 25 s.
    expect(placeNewCut(cuts, seg, 30, 22)?.atSec).toBe(25)
    expect(placeNewCut(cuts, seg, 30, 2)?.atSec).toBe(10) // the playhead is on cut one, so the next free space is after it
    expect(placeNewCut(cuts, { startSec: 0, endSec: 20 }, 30, 0)).toBeNull()
  })
})

describe('video cut split and delete', () => {
  const cuts: TimelineCut[] = [
    { startSec: 10, endSec: 20, atSec: 0 },
    { startSec: 30, endSec: 40, atSec: 15 }
  ]

  it('splits a cut at the playhead: both pieces keep their footage and their place', () => {
    const result = splitCut(cuts, 0, 4)
    expect(result).not.toBeNull()
    expect(result!.cuts).toEqual([
      { startSec: 10, endSec: 14, atSec: 0 },
      { startSec: 14, endSec: 20, atSec: 4 },
      { startSec: 30, endSec: 40, atSec: 15 }
    ])
    expect(result!.rightIndex).toBe(1)
  })

  it('refuses a split that would leave a sliver', () => {
    expect(splitCut(cuts, 0, 0.2)).toBeNull()
    expect(splitCut(cuts, 0, 9.8)).toBeNull()
  })

  it('refuses a split once the short has the most cuts allowed', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ startSec: i * 10, endSec: i * 10 + 8, atSec: i * 10 }))
    expect(splitCut(six, 0, 4)).toBeNull()
  })

  it('removes the chosen cuts, and keeps at least one', () => {
    expect(deleteCuts(cuts, [0])).toEqual([cuts[1]])
    expect(deleteCuts(cuts, [0, 1])).toEqual(cuts)
  })
})

describe('music lane limits', () => {
  const others = [clip('left', 0, 10), clip('right', 30, 10)]

  it('finds the neighbours on either side', () => {
    expect(neighbourBounds(clip('mid', 15, 5), others)).toEqual({ lo: 10, hi: 30 })
  })

  it('stops a clip at its neighbour when it is moved', () => {
    const moved = moveMusicClips([...others, clip('mid', 15, 5)], ['mid'], 100)
    expect(moved.find((c) => c.id === 'mid')!.startSec).toBe(25)
  })

  it('stops a clip at the start of the timeline', () => {
    const moved = moveMusicClips([clip('mid', 15, 5)], ['mid'], -100)
    expect(moved[0].startSec).toBe(0)
  })

  it('moves a group together, limited by whichever member meets a limit first', () => {
    const lane = [clip('a', 2, 4), clip('b', 10, 4), clip('wall', 20, 4)]
    // Moving a and b right by 10 would push b into the wall at 20, so the group moves only 6.
    const moved = moveMusicClips(lane, ['a', 'b'], 10)
    expect(moved.map((c) => c.startSec)).toEqual([8, 16, 20])
  })

  it('does not move a clip when the delta leaves it no room', () => {
    const lane = [clip('a', 0, 10), clip('b', 10, 10)]
    expect(moveMusicClips(lane, ['a'], 5)).toEqual(lane)
  })

  it('limits an edge trim at the neighbour on that side', () => {
    const mid = clip('mid', 15, 5)
    expect(clampResizeDelta(mid, 'start', -20, others)).toBe(-5)
    expect(clampResizeDelta(mid, 'end', 50, others)).toBe(10)
  })
})
