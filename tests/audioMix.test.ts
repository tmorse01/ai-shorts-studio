import { describe, expect, it } from 'vitest'
import {
  audioSourcesAt,
  clampMasterVolume,
  clipAudioSources,
  diffAudioSources,
  needsResync,
  registerAudioSourceProvider,
  timelineMsForSource,
  type AudioSource
} from '@renderer/features/audio/audioMix'
import { FRAME_MS } from '@renderer/features/playback/playbackClock'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return { id, mediaId: 'm1', startMs, durationMs, sourceInMs: 1000, transform, ...extra }
}

function track(id: string, kind: Track['kind'], clips: Clip[], muted = false): Track {
  return { id, kind, role: kind === 'audio' ? 'narration' : 'main', muted, clips }
}

const timeline: Timeline = {
  tracks: [
    track('v1', 'video', [clip('video-a', 0, 4000)]),
    track('a1', 'audio', [clip('audio-a', 0, 4000, { gain: 0.5 })]),
    track('a2', 'audio', [clip('audio-muted', 0, 4000)], true)
  ]
}

describe('clip audio sources', () => {
  it('plays one source per active audio-bearing clip, skipping muted tracks', () => {
    const sources = clipAudioSources(timeline, 500)
    expect(sources.map((source) => source.key)).toEqual(['video-a', 'audio-a'])
  })

  it('maps the file time from the clip source in and the playhead', () => {
    const [video] = clipAudioSources(timeline, 500)
    expect(video.sourceTimeMs).toBe(1500)
    expect(video.gain).toBe(1)
    expect(timelineMsForSource(video, 1500)).toBe(500)
  })

  it('applies clip gain', () => {
    const audio = clipAudioSources(timeline, 0).find((source) => source.key === 'audio-a')
    expect(audio?.gain).toBe(0.5)
  })

  it('leaves out clips with no footage, clips outside their time, and video with detached audio', () => {
    const detached: Timeline = {
      tracks: [
        track('v1', 'video', [clip('video-a', 0, 1000, { linkedAudio: 'audio-a' })]),
        track('t1', 'text', [clip('title', 0, 1000, { mediaId: undefined, text: 'Hi' })]),
        track('a1', 'audio', [clip('late', 2000, 1000)])
      ]
    }
    expect(clipAudioSources(detached, 500)).toEqual([])
    expect(clipAudioSources(detached, 2500).map((source) => source.key)).toEqual(['late'])
  })

  it('leaves out media with no sound track', () => {
    const sources = clipAudioSources(timeline, 0, (mediaId) => mediaId !== 'm1')
    expect(sources).toEqual([])
  })
})

describe('source provider hook', () => {
  it('adds provider sources and stops adding them once unregistered', () => {
    const extra: AudioSource = {
      key: 'narration-1',
      mediaId: 'voice',
      startMs: 0,
      sourceInMs: 0,
      sourceTimeMs: 0,
      gain: 1
    }
    const unregister = registerAudioSourceProvider(() => [extra])
    expect(audioSourcesAt(timeline, 0).map((source) => source.key)).toContain('narration-1')
    unregister()
    expect(audioSourcesAt(timeline, 0).map((source) => source.key)).not.toContain('narration-1')
  })
})

describe('source diff', () => {
  it('splits the plan into starts, keeps and stops', () => {
    const next = clipAudioSources(timeline, 0)
    const diff = diffAudioSources(new Set(['video-a', 'gone']), next)
    expect(diff.keep.map((source) => source.key)).toEqual(['video-a'])
    expect(diff.start.map((source) => source.key)).toEqual(['audio-a'])
    expect(diff.stop).toEqual(['gone'])
  })
})

describe('resync and drift', () => {
  it('accepts drift of up to one frame and asks for a seek past it', () => {
    expect(needsResync(1000 + FRAME_MS, 1000)).toBe(false)
    expect(needsResync(1000 + FRAME_MS + 1, 1000)).toBe(true)
  })

  it('keeps an element within one frame over 60 seconds when it is resynced each tick', () => {
    // An element that runs 1% slow would drift 600 ms in 60 s without correction.
    const tickMs = 100
    let element = 0
    let maxDrift = 0
    for (let t = tickMs; t <= 60_000; t += tickMs) {
      element += tickMs * 0.99
      const expected = t
      if (needsResync(element, expected)) element = expected
      maxDrift = Math.max(maxDrift, Math.abs(element - expected))
    }
    expect(maxDrift).toBeLessThanOrEqual(FRAME_MS + 2)
  })

  it('shows the uncorrected drift is far beyond a frame', () => {
    expect(60_000 * 0.01).toBeGreaterThan(FRAME_MS * 10)
  })
})

describe('master volume', () => {
  it('clamps to 0 to 1 and treats a non-number as full volume', () => {
    expect(clampMasterVolume(-1)).toBe(0)
    expect(clampMasterVolume(2)).toBe(1)
    expect(clampMasterVolume(0.4)).toBe(0.4)
    expect(clampMasterVolume(Number.NaN)).toBe(1)
  })
})
