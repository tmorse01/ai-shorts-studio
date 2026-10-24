import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  DEFAULT_PX_PER_MS,
  fitPxPerMs,
  followPlayhead,
  MAX_PX_PER_MS,
  MIN_PX_PER_MS,
  rulerIntervalMs,
  rulerTicks,
  targetBand,
  timeToX,
  xToTime,
  zoomStep
} from '@renderer/features/timeline/timelineView'
import { timelineViewStore } from '@renderer/features/timeline/timelineViewStore'
import { addTrack, setTrackFlag } from '@shared/timeline/edits'
import type { Timeline } from '@shared/timeline/timeline'

describe('time and position', () => {
  it('converts between time and x at a scale, and back', () => {
    expect(timeToX(2000, 0.1)).toBe(200)
    expect(xToTime(200, 0.1)).toBe(2000)
    expect(xToTime(-30, 0.1)).toBe(0)
  })

  it('clamps zoom to its limits and steps by a quarter', () => {
    expect(clampZoom(100)).toBe(MAX_PX_PER_MS)
    expect(clampZoom(0)).toBe(MIN_PX_PER_MS)
    expect(zoomStep(DEFAULT_PX_PER_MS, 1)).toBeCloseTo(0.125)
    expect(zoomStep(DEFAULT_PX_PER_MS, -1)).toBeCloseTo(0.08)
  })

  it('fits a duration into the view width, leaving room at the right', () => {
    expect(fitPxPerMs(10_000, 1040)).toBeCloseTo(0.1)
  })
})

describe('ruler', () => {
  it('picks the first interval that leaves room for a label', () => {
    expect(rulerIntervalMs(0.1)).toBe(1000)
    expect(rulerIntervalMs(0.01)).toBe(10_000)
    expect(rulerIntervalMs(0.0001)).toBe(120_000)
  })

  it('lists label times from zero up to the total length', () => {
    expect(rulerTicks(3000, 0.1)).toEqual([0, 1000, 2000, 3000])
  })
})

describe('target band', () => {
  it('places the band from the minimum to the maximum, with the tint from the maximum', () => {
    expect(targetBand(30_000, 60_000, 0.01)).toEqual({
      leftPx: 300,
      widthPx: 300,
      overMaxPx: 600
    })
  })
})

describe('playhead follow', () => {
  it('leaves the scroll alone while the playhead is comfortably inside the view', () => {
    expect(followPlayhead(0, 300, 800)).toBe(0)
  })

  it('scrolls forward when the playhead nears the right edge, and back at the left', () => {
    expect(followPlayhead(0, 790, 800)).toBe(790 - (800 - 48))
    expect(followPlayhead(500, 510, 800)).toBe(462)
  })
})

describe('zoom store', () => {
  it('zooms in and out one step, and clamps a set value', () => {
    timelineViewStore.setState({ pxPerMs: DEFAULT_PX_PER_MS })
    timelineViewStore.getState().zoomIn()
    expect(timelineViewStore.getState().pxPerMs).toBeCloseTo(0.125)
    timelineViewStore.getState().setPxPerMs(50)
    expect(timelineViewStore.getState().pxPerMs).toBe(MAX_PX_PER_MS)
  })
})

describe('track lock and flags', () => {
  const base: Timeline = {
    tracks: [{ id: 'main', kind: 'video', role: 'main', muted: false, clips: [] }]
  }

  it('locks and unlocks a track, and mutes it', () => {
    const locked = setTrackFlag(base, 'main', 'locked', true)
    expect(locked.tracks[0].locked).toBe(true)
    expect(setTrackFlag(locked, 'main', 'locked', false).tracks[0].locked).toBe(false)
    expect(setTrackFlag(base, 'main', 'muted', true).tracks[0].muted).toBe(true)
  })

  it('refuses a flag change on a missing track', () => {
    expect(() => setTrackFlag(base, 'nope', 'muted', true)).toThrow('No track')
  })

  it('adds an empty track and refuses a duplicate id', () => {
    const added = addTrack(base, {
      id: 'text1',
      kind: 'text',
      role: 'text',
      muted: false,
      clips: []
    })
    expect(added.tracks.map((track) => track.id)).toEqual(['main', 'text1'])
    expect(() =>
      addTrack(added, { id: 'main', kind: 'video', role: 'overlay', muted: false, clips: [] })
    ).toThrow('already exists')
  })
})
