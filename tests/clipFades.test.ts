import { describe, expect, it } from 'vitest'
import { clipAudioSources, fadeGain } from '@renderer/features/audio/audioMix'
import { dbToGain, gainToDb, SILENT_DB } from '@renderer/ui/fieldMath'
import { setClipAudio, TimelineEditError } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'

const base = { startMs: 1000, durationMs: 2000 }

function audioClip(extra: Partial<Clip> = {}): Clip {
  return {
    id: 'a1',
    mediaId: 'm1',
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

function audioTimeline(clip: Clip): Timeline {
  return { tracks: [{ id: 't', kind: 'audio', role: 'music', muted: false, clips: [clip] }] }
}

describe('fade gain', () => {
  it('is 1 with no fades', () => {
    expect(fadeGain(base, 1000)).toBe(1)
    expect(fadeGain(base, 2500)).toBe(1)
  })

  it('ramps up over the fade in and down over the fade out', () => {
    const faded = { ...base, fadeInMs: 500, fadeOutMs: 1000 }
    expect(fadeGain(faded, 1000)).toBe(0)
    expect(fadeGain(faded, 1250)).toBe(0.5)
    expect(fadeGain(faded, 1500)).toBe(1)
    expect(fadeGain(faded, 2000)).toBe(1)
    expect(fadeGain(faded, 2500)).toBe(0.5)
    expect(fadeGain(faded, 3000)).toBe(0)
  })

  it('stays in 0 to 1 outside the clip', () => {
    const faded = { ...base, fadeInMs: 500 }
    expect(fadeGain(faded, 500)).toBe(0)
    expect(fadeGain(faded, 4000)).toBe(1)
  })
})

describe('fades in the preview mix', () => {
  it('scales the clip gain by the fade', () => {
    const timeline = audioTimeline(audioClip({ gain: 0.8, fadeInMs: 1000 }))
    expect(clipAudioSources(timeline, 500)[0]?.gain).toBeCloseTo(0.4)
    expect(clipAudioSources(timeline, 1500)[0]?.gain).toBeCloseTo(0.8)
  })
})

describe('setClipAudio fades', () => {
  it('sets fades and clamps each to the clip length', () => {
    const next = setClipAudio(audioTimeline(audioClip()), 'a1', {
      fadeInMs: 500,
      fadeOutMs: 9000
    })
    const clip = next.tracks[0].clips[0]
    expect(clip.fadeInMs).toBe(500)
    expect(clip.fadeOutMs).toBe(2000)
  })

  it('refuses a negative or non-finite fade', () => {
    const timeline = audioTimeline(audioClip())
    expect(() => setClipAudio(timeline, 'a1', { fadeInMs: -1 })).toThrow(TimelineEditError)
    expect(() => setClipAudio(timeline, 'a1', { fadeOutMs: Number.NaN })).toThrow(TimelineEditError)
  })
})

describe('dB field conversion', () => {
  it('maps unity gain to 0 dB and back', () => {
    expect(gainToDb(1)).toBeCloseTo(0)
    expect(dbToGain(0)).toBeCloseTo(1)
    expect(dbToGain(gainToDb(0.5))).toBeCloseTo(0.5)
  })

  it('reads silence as the quietest dB value, and maps that back to silence', () => {
    expect(gainToDb(0)).toBe(SILENT_DB)
    expect(dbToGain(SILENT_DB)).toBe(0)
    expect(dbToGain(SILENT_DB - 10)).toBe(0)
  })
})
