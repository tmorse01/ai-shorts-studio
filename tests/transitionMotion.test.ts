import { describe, expect, it } from 'vitest'
import { applyTransitionMotion, CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/compositor/frame'
import { buildRenderGraph } from '@shared/render/renderGraph'
import {
  TRANSITION_KINDS,
  TRANSITION_LABELS,
  ZOOM_PEAK_SCALE,
  motionValue,
  transitionLevels,
  transitionMotion
} from '@shared/timeline/transitions'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(
  id: string,
  mediaId: string,
  startMs: number,
  durationMs: number,
  extra: Partial<Clip> = {}
): Clip {
  return { id, mediaId, startMs, durationMs, sourceInMs: 0, transform: IDENTITY, ...extra }
}

function track(id: string, clips: Clip[]): Track {
  return { id, kind: 'video', role: 'main', muted: false, clips }
}

// Two landscape clips meeting at 3000 ms, joined by a 500 ms transition of the given kind. The window runs
// from 2750 to 3250 ms.
function joined(kind: 'whip' | 'zoom'): Timeline {
  return {
    tracks: [
      track('main', [
        clip('c1', 'cam-a', 0, 3000),
        clip('c2', 'cam-a', 3000, 3000, { sourceInMs: 500 })
      ])
    ],
    transitions: [{ id: 't1', fromClipId: 'c1', toClipId: 'c2', durationMs: 500, kind }]
  }
}

const SIZES: Record<string, { width: number; height: number }> = {
  'cam-a': { width: 1920, height: 1080 }
}
const sizeOf = (mediaId: string) => SIZES[mediaId] ?? null

describe('whip and zoom kinds', () => {
  it('lists both kinds in the picker with their labels', () => {
    expect(TRANSITION_KINDS).toContain('whip')
    expect(TRANSITION_KINDS).toContain('zoom')
    expect(TRANSITION_LABELS.whip).toBe('Whip')
    expect(TRANSITION_LABELS.zoom).toBe('Zoom')
  })

  it('moves the whip pictures across the canvas, one out to the left and one in from the right', () => {
    const middle = transitionLevels('whip', 0.25)
    expect(middle.outgoing).toEqual({ opacity: 1, gain: 0.75, overBlack: false, offsetX: -0.25 })
    expect(middle.incoming).toEqual({ opacity: 1, gain: 0.25, overBlack: false, offsetX: 0.75 })
    expect(transitionLevels('whip', 1).incoming.offsetX).toBe(0)
    expect(transitionLevels('whip', 0).incoming.offsetX).toBe(1)
  })

  it('zooms the outgoing picture in while the incoming one settles and fades up', () => {
    const middle = transitionLevels('zoom', 0.5)
    expect(middle.outgoing.opacity).toBe(1)
    expect(middle.outgoing.scale).toBeCloseTo(1 + (ZOOM_PEAK_SCALE - 1) * 0.5)
    expect(middle.incoming.opacity).toBe(0.5)
    expect(middle.incoming.scale).toBeCloseTo(ZOOM_PEAK_SCALE - (ZOOM_PEAK_SCALE - 1) * 0.5)
    expect(transitionLevels('zoom', 0).incoming.scale).toBe(ZOOM_PEAK_SCALE)
    expect(transitionLevels('zoom', 1).incoming.scale).toBe(1)
  })

  it('leaves crossfade and dip without motion keys', () => {
    for (const kind of ['crossfade', 'dip-to-black'] as const) {
      const levels = transitionLevels(kind, 0.5)
      expect('scale' in levels.outgoing).toBe(false)
      expect('offsetX' in levels.incoming).toBe(false)
      expect(transitionMotion(kind, 'incoming')).toBeNull()
    }
  })

  it('interpolates a motion range linearly and clamps the progress', () => {
    expect(motionValue({ from: 1, to: -1 }, 0.5)).toBe(0)
    expect(motionValue({ from: 1, to: -1 }, 2)).toBe(-1)
  })
})

describe('applying transition motion to a placement', () => {
  const centred = {
    centerX: CANVAS_WIDTH / 2,
    centerY: CANVAS_HEIGHT / 2,
    width: 1080,
    height: 608,
    rotationDeg: 0
  }

  it('leaves a placement with no motion as it is', () => {
    expect(applyTransitionMotion(centred, undefined)).toBe(centred)
    expect(applyTransitionMotion(centred, transitionLevels('crossfade', 0.5).incoming)).toBe(
      centred
    )
  })

  it('shifts a picture by its offset as a fraction of the canvas width', () => {
    const moved = applyTransitionMotion(centred, {
      opacity: 1,
      gain: 1,
      overBlack: false,
      offsetX: 0.5
    })
    expect(moved.centerX).toBe(CANVAS_WIDTH / 2 + CANVAS_WIDTH / 2)
    expect(moved.width).toBe(1080)
  })

  it('scales a picture about the canvas centre, so an off-centre picture keeps its relative place', () => {
    const offCentre = { ...centred, centerX: 100, width: 500 }
    const zoomed = applyTransitionMotion(offCentre, {
      opacity: 1,
      gain: 1,
      overBlack: false,
      scale: 2
    })
    expect(zoomed.centerX).toBe(CANVAS_WIDTH / 2 + (100 - CANVAS_WIDTH / 2) * 2)
    expect(zoomed.width).toBe(1000)
  })
})

describe('export of whip and zoom', () => {
  it('fades only the sound of a whip, since its pictures stay opaque', () => {
    const graph = buildRenderGraph(joined('whip'), { sizeOf }).filterComplex
    expect(graph).not.toContain('alpha=1')
    expect(graph).toContain('afade=t=out:st=2.75:d=0.5')
    expect(graph).toContain('afade=t=in:st=2.75:d=0.5')
  })

  it('zooms through the expressions of t, and fades the incoming picture in', () => {
    const graph = buildRenderGraph(joined('zoom'), { sizeOf }).filterComplex
    expect(graph).toContain('fade=t=in:st=2.75:d=0.5:alpha=1')
    expect(graph).toContain("scale=w='")
    expect(graph).toContain('eval=frame')
    expect(graph).toContain('clip((t-2.75)/0.5,0,1)')
  })

  it('moves a whip picture with its position as an expression of t', () => {
    const graph = buildRenderGraph(joined('whip'), { sizeOf }).filterComplex
    expect(graph).toContain('clip((t-2.75)/0.5,0,1)')
    expect(graph).toMatch(
      /x='round\(540\+\(\(540\)-540\)\*\(1\)\+\(if\(gte\(t,2\.75\)\*lt\(t,3\.25\),\(0\+\(-1\)\*/
    )
  })

  it('leaves a clip with no motion on its static position', () => {
    const graph = buildRenderGraph(
      { tracks: [track('main', [clip('c1', 'cam-a', 0, 4000)])] },
      { sizeOf }
    ).filterComplex
    expect(graph).not.toContain('eval=frame')
    expect(graph).toContain('overlay=x=')
  })
})
