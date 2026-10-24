import { describe, expect, it } from 'vitest'
import { audioTargetFor } from '@renderer/features/audio/clipSound'
import {
  fadeHandleX,
  fadeMsFromPointer,
  fadeRampPoints
} from '@renderer/features/timeline/clipView'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'

const clip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c',
  mediaId: 'm',
  startMs: 1000,
  durationMs: 2000,
  sourceInMs: 0,
  transform: IDENTITY_TRANSFORM,
  ...extra
})

// Points as [x, y] pairs, parsed from the SVG string.
function points(text: string): [number, number][] {
  return text.split(' ').map((pair) => pair.split(',').map(Number) as [number, number])
}

describe('fade ramp points', () => {
  it('is flat at the top with no fades', () => {
    expect(points(fadeRampPoints(clip(), 0.1, 36))).toEqual([
      [0, 6],
      [0, 6],
      [200, 6],
      [200, 6]
    ])
  })

  it('rises from the bottom over a fade in and falls to it over a fade out', () => {
    expect(points(fadeRampPoints(clip({ fadeInMs: 500, fadeOutMs: 1000 }), 0.1, 36))).toEqual([
      [0, 30],
      [50, 6],
      [100, 6],
      [200, 30]
    ])
  })

  it('never crosses the fades, even when they add up to more than the clip', () => {
    const ramp = points(fadeRampPoints(clip({ fadeInMs: 1500, fadeOutMs: 1500 }), 0.1, 36))
    expect(ramp[1][0]).toBe(150)
    expect(ramp[2][0]).toBe(150)
  })
})

describe('fade handle position', () => {
  it('sits at the end of the fade in and at the start of the fade out', () => {
    const timed = clip({ fadeInMs: 500, fadeOutMs: 250 })
    expect(fadeHandleX(timed, 'in', 0.1)).toBe(50)
    expect(fadeHandleX(timed, 'out', 0.1)).toBe(175)
  })

  it('sits at the clip edges with no fades', () => {
    expect(fadeHandleX(clip(), 'in', 0.1)).toBe(0)
    expect(fadeHandleX(clip(), 'out', 0.1)).toBe(200)
  })
})

describe('fade length from a drag', () => {
  it('measures a fade in from the clip start and a fade out from the clip end', () => {
    expect(fadeMsFromPointer(clip(), 'in', 1400)).toBe(400)
    expect(fadeMsFromPointer(clip(), 'out', 2600)).toBe(400)
  })

  it('stays within 0 and the clip length, and rounds to whole ms', () => {
    expect(fadeMsFromPointer(clip(), 'in', 500)).toBe(0)
    expect(fadeMsFromPointer(clip(), 'in', 9000)).toBe(2000)
    expect(fadeMsFromPointer(clip(), 'out', 1000.4)).toBe(2000)
    expect(fadeMsFromPointer(clip(), 'in', 1400.6)).toBe(401)
  })
})

describe('audio target for the Audio tab', () => {
  const audioTimeline = (linkedAudio?: string): Timeline => ({
    tracks: [
      {
        id: 'v',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: [clip({ id: 'video', mediaId: 'm', ...(linkedAudio ? { linkedAudio } : {}) })]
      },
      {
        id: 'a',
        kind: 'audio',
        role: 'music',
        muted: false,
        clips: [clip({ id: 'sound' })]
      }
    ]
  })

  it('edits a standalone audio clip', () => {
    expect(audioTargetFor(audioTimeline(), ['sound'])?.id).toBe('sound')
  })

  it('leaves linked sound to the Video clip section', () => {
    expect(audioTargetFor(audioTimeline('sound'), ['sound'])).toBeNull()
  })

  it('gives nothing for a video clip, several clips, or no selection', () => {
    expect(audioTargetFor(audioTimeline(), ['video'])).toBeNull()
    expect(audioTargetFor(audioTimeline(), ['video', 'sound'])).toBeNull()
    expect(audioTargetFor(audioTimeline(), [])).toBeNull()
  })
})
