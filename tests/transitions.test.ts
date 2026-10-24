import { describe, expect, it } from 'vitest'
import {
  addCutTransition,
  deleteClip,
  moveClip,
  resizeCutTransition,
  TimelineEditError
} from '@shared/timeline/edits'
import { resolveFrame, clipsAt } from '@shared/timeline/resolveFrame'
import {
  clampTransitionMs,
  transitionLevels,
  transitionLimitMs,
  transitionSides,
  transitionWindow
} from '@shared/timeline/transitions'
import {
  IDENTITY_TRANSFORM,
  type Clip,
  type Timeline,
  type Transition
} from '@shared/timeline/timeline'
import { audioSourcesAt } from '@renderer/features/audio/audioMix'

function clip(id: string, startMs: number, durationMs: number, sourceInMs = 0): Clip {
  return {
    id,
    mediaId: `media-${id}`,
    startMs,
    durationMs,
    sourceInMs,
    transform: { ...IDENTITY_TRANSFORM }
  }
}

// Two clips on the Main track meeting at 1000 ms, with handles on both sides of the cut.
function cut(): Timeline {
  return {
    tracks: [
      {
        id: 'main',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: [clip('a', 0, 1000, 500), clip('b', 1000, 1000, 500)]
      }
    ]
  }
}

function withTransition(timeline: Timeline, transition: Transition): Timeline {
  return { ...timeline, transitions: [transition] }
}

describe('transition window', () => {
  it('centres the window on the cut, with the odd millisecond after it', () => {
    expect(transitionSides(300)).toEqual({ beforeMs: 150, afterMs: 150 })
    expect(transitionSides(301)).toEqual({ beforeMs: 150, afterMs: 151 })
    expect(
      transitionWindow({ id: 't', fromClipId: 'a', toClipId: 'b', durationMs: 300 }, 1000)
    ).toEqual({ startMs: 850, endMs: 1150 })
  })
})

describe('transition levels', () => {
  it('crossfades the sound linearly and keeps the outgoing picture under the incoming one', () => {
    const middle = transitionLevels('crossfade', 0.5)
    expect(middle.outgoing).toEqual({ opacity: 1, gain: 0.5, overBlack: false })
    expect(middle.incoming).toEqual({ opacity: 0.5, gain: 0.5, overBlack: false })
  })

  it('dips to black at the midpoint, with both clips over black', () => {
    const middle = transitionLevels('dip-to-black', 0.5)
    expect(middle.outgoing.opacity).toBe(0)
    expect(middle.incoming.opacity).toBe(0)
    expect(middle.outgoing.overBlack).toBe(true)
    expect(transitionLevels('dip-to-black', 0.25).outgoing.opacity).toBeCloseTo(0.5)
    expect(transitionLevels('dip-to-black', 0.75).incoming.opacity).toBeCloseTo(0.5)
  })
})

describe('transition limits', () => {
  it('is limited by the handle on each side of the cut', () => {
    // Incoming handle 500 ms before its in point; outgoing clip has 200 ms of footage past its out point.
    const from = clip('a', 0, 1000, 0)
    const to = clip('b', 1000, 1000, 500)
    expect(transitionLimitMs(from, to, 1200)).toBe(400)
    expect(clampTransitionMs(300, 400)).toBe(300)
    expect(clampTransitionMs(900, 400)).toBe(400)
    expect(clampTransitionMs(0, 400)).toBe(0)
  })

  it('has no outgoing limit when the source length is unknown, and a missing incoming handle leaves 1 ms', () => {
    const from = clip('a', 0, 1000, 0)
    expect(transitionLimitMs(from, clip('b', 1000, 1000, 500))).toBe(1001)
    // No incoming handle: only the single millisecond after the cut fits.
    expect(transitionLimitMs(from, clip('b', 1000, 1000, 0), 5000)).toBe(1)
  })
})

describe('adding a transition on a cut', () => {
  it('clamps the default length to the handles', () => {
    const tight = {
      tracks: [
        {
          ...cut().tracks[0],
          clips: [clip('a', 0, 1000, 0), clip('b', 1000, 1000, 100)]
        }
      ]
    }
    const added = addCutTransition(tight, 't1', 'b', 'crossfade', 300, () => 1200)
    expect(added.transitions?.[0].durationMs).toBe(201)
    expect(added.transitions?.[0].kind).toBe('crossfade')
  })

  it('refuses a clip that has no cut before it', () => {
    expect(() => addCutTransition(cut(), 't1', 'a', 'crossfade', 300, () => 5000)).toThrow(
      TimelineEditError
    )
  })

  it('shortens a resize to the handles and drops the transition when a clip leaves the cut', () => {
    const added = addCutTransition(cut(), 't1', 'b', 'dip-to-black', 300, () => 5000)
    expect(resizeCutTransition(added, 't1', 9000, () => 5000).transitions?.[0].durationMs).toBe(
      1001
    )
    const moved = moveClip(added, 'b', 'main', 1500)
    expect(moved.transitions).toEqual([])
    expect(deleteClip(added, 'b').transitions).toEqual([])
  })
})

describe('frame and audio at a transition', () => {
  const timeline = withTransition(cut(), {
    id: 't1',
    fromClipId: 'a',
    toClipId: 'b',
    durationMs: 300
  })

  it('starts the incoming clip before the cut and runs the outgoing clip past it', () => {
    expect(clipsAt(timeline, 880).map((item) => item.clip.id)).toEqual(['a', 'b'])
    expect(clipsAt(timeline, 849).map((item) => item.clip.id)).toEqual(['a'])
    expect(clipsAt(timeline, 1150).map((item) => item.clip.id)).toEqual(['b'])
  })

  it('reads source time through the handles, and fades the picture at the midpoint', () => {
    const layers = resolveFrame(timeline, 1000)
    const outgoing = layers.find((layer) => layer.clipId === 'a')
    const incoming = layers.find((layer) => layer.clipId === 'b')
    expect(outgoing?.sourceTimeMs).toBe(1500)
    expect(incoming?.sourceTimeMs).toBe(500)
    expect(incoming?.fade?.opacity).toBeCloseTo(0.5)
    expect(resolveFrame(timeline, 1200).find((layer) => layer.clipId === 'b')?.fade).toBeUndefined()
  })

  it('mixes the sound of both clips through the crossfade', () => {
    const sources = audioSourcesAt(timeline, 1000, () => true)
    const gains = Object.fromEntries(sources.map((source) => [source.key, source.gain]))
    expect(gains.a).toBeCloseTo(0.5)
    expect(gains.b).toBeCloseTo(0.5)
  })
})
