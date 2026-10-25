import { describe, expect, it } from 'vitest'
import {
  lineNarrationStateFor,
  lineNarrationStates,
  linkedClipsByLine,
  setLineNarrationClip
} from '@shared/narration/lineNarration'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'
import type { ScriptLine } from '@shared/project/schema'

const lines: ScriptLine[] = [
  { id: 'l1', text: 'First line' },
  { id: 'l2', text: 'Second line' },
  { id: 'l3', text: 'Third line' }
]
const lineIds = lines.map((line) => line.id)

function emptyTimeline(): Timeline {
  return {
    tracks: [
      { id: 'main', kind: 'video', role: 'main', muted: false, clips: [] },
      { id: 'narr', kind: 'audio', role: 'narration', muted: false, clips: [] }
    ]
  }
}

function lineClip(id: string, lineId: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    mediaId: `media-${id}`,
    startMs,
    durationMs,
    sourceInMs: 0,
    transform: { ...IDENTITY_TRANSFORM },
    narration: { source: 'recorded', scriptLineId: lineId, text: 'x' }
  }
}

function withClips(clips: Clip[]): Timeline {
  const timeline = emptyTimeline()
  return {
    tracks: timeline.tracks.map((track) =>
      track.role === 'narration' ? { ...track, clips } : track
    )
  }
}

function clipsOn(timeline: Timeline): Clip[] {
  return timeline.tracks.find((track) => track.role === 'narration')?.clips ?? []
}

describe('per-line narration state', () => {
  it('reports every line as not narrated on an empty lane', () => {
    const states = lineNarrationStates(lines, emptyTimeline())
    expect(states.map((state) => [state.lineId, state.status, state.clipId])).toEqual([
      ['l1', 'none', null],
      ['l2', 'none', null],
      ['l3', 'none', null]
    ])
  })

  it('places a line with no clip after the narrated lines before it', () => {
    const timeline = withClips([lineClip('a', 'l1', 0, 2000), lineClip('c', 'l3', 9000, 1000)])
    const states = lineNarrationStates(lines, timeline)
    expect(states[0]).toMatchObject({ status: 'recorded', clipId: 'a', startMs: 0 })
    expect(states[1]).toMatchObject({ status: 'none', clipId: null, startMs: 2000 })
    expect(states[2]).toMatchObject({ status: 'recorded', clipId: 'c', startMs: 9000 })
  })

  it('keeps a narrated line at its clip position', () => {
    const timeline = withClips([lineClip('b', 'l2', 3500, 1500)])
    expect(lineNarrationStateFor(lines, timeline, 'l2')).toMatchObject({
      startMs: 3500,
      clipId: 'b'
    })
  })

  it('returns null for a line that is not in the script', () => {
    expect(lineNarrationStateFor(lines, emptyTimeline(), 'missing')).toBeNull()
  })

  it('maps a line to its earliest linked clip and skips unlinked narration clips', () => {
    const timeline = withClips([
      lineClip('late', 'l1', 5000, 500),
      lineClip('early', 'l1', 1000, 500),
      { ...lineClip('free', 'x', 0, 100), narration: { source: 'recorded' } }
    ])
    const map = linkedClipsByLine(timeline)
    expect(map.get('l1')?.id).toBe('early')
    expect(map.size).toBe(1)
  })
})

describe('setLineNarrationClip', () => {
  it('places a new clip at the line position and creates the Narration lane when missing', () => {
    const timeline: Timeline = {
      tracks: [{ id: 'main', kind: 'video', role: 'main', muted: false, clips: [] }]
    }
    const clip = lineClip('new', 'l1', 0, 1800)
    const next = setLineNarrationClip(timeline, {
      lineIds,
      lineId: 'l1',
      clip,
      narrationTrackId: 'narr-new'
    })
    const narration = next.tracks.find((track) => track.role === 'narration')
    expect(narration?.id).toBe('narr-new')
    expect(narration?.clips).toEqual([
      expect.objectContaining({ id: 'new', startMs: 0, durationMs: 1800 })
    ])
  })

  it('replaces only the clip of the redone line and keeps its position', () => {
    const timeline = withClips([
      lineClip('a', 'l1', 0, 2000),
      lineClip('b', 'l2', 2000, 1000),
      lineClip('c', 'l3', 3000, 1000)
    ])
    const next = setLineNarrationClip(timeline, {
      lineIds,
      lineId: 'l2',
      clip: lineClip('b2', 'l2', 0, 1400),
      narrationTrackId: 'unused'
    })
    const clips = clipsOn(next)
    expect(clips.map((clip) => clip.id).sort()).toEqual(['a', 'b2', 'c'])
    expect(clips.find((clip) => clip.id === 'b2')).toMatchObject({
      startMs: 2000,
      durationMs: 1400
    })
    expect(clips.find((clip) => clip.id === 'a')).toMatchObject({ startMs: 0, durationMs: 2000 })
    expect(clips.find((clip) => clip.id === 'c')).toMatchObject({ startMs: 3000, durationMs: 1000 })
  })

  it('refuses a clip that is not linked to the line it is placed for', () => {
    expect(() =>
      setLineNarrationClip(emptyTimeline(), {
        lineIds,
        lineId: 'l1',
        clip: lineClip('bad', 'l2', 0, 100),
        narrationTrackId: 'narr'
      })
    ).toThrow(/linked to the line/)
  })

  it('refuses a line the script does not have', () => {
    expect(() =>
      setLineNarrationClip(emptyTimeline(), {
        lineIds,
        lineId: 'nope',
        clip: lineClip('bad', 'nope', 0, 100),
        narrationTrackId: 'narr'
      })
    ).toThrow(/no line nope/)
  })
})
