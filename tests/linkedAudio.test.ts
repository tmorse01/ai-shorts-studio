import { describe, expect, it } from 'vitest'
import { clipAudioSources } from '@renderer/features/audio/audioMix'
import { soundClipFor } from '@renderer/features/audio/clipSound'
import {
  closeGap,
  deleteClip,
  deleteClips,
  detachAudio,
  moveClip,
  placeClips,
  setClipAudio,
  splitClip,
  splitClipsAt,
  trimClip,
  TimelineEditError
} from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'media_1',
    startMs,
    durationMs,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

function track(
  id: string,
  kind: Track['kind'],
  role: Track['role'],
  clips: Clip[],
  locked = false
) {
  return { id, kind, role, muted: false, locked, clips }
}

// Two video clips on the main track, each linked to an audio clip on the music track.
function linked(): Timeline {
  return {
    tracks: [
      track('main', 'video', 'main', [
        clip('v1', 0, 1000, { linkedAudio: 'a1' }),
        clip('v2', 2000, 1000, { linkedAudio: 'a2' })
      ]),
      track('music', 'audio', 'music', [clip('a1', 0, 1000), clip('a2', 2000, 1000)])
    ]
  }
}

function find(timeline: Timeline, id: string): Clip | undefined {
  return timeline.tracks.flatMap((item) => item.clips).find((item) => item.id === id)
}

// [startMs, durationMs, sourceInMs] of a clip, for compact checks.
function span(timeline: Timeline, id: string): number[] | undefined {
  const found = find(timeline, id)
  return found && [found.startMs, found.durationMs, found.sourceInMs]
}

function counter(): () => string {
  let count = 0
  return () => `new${++count}`
}

describe('linked audio follows its video clip', () => {
  it('moves with the video clip when it is placed', () => {
    const next = placeClips(linked(), ['v2'], 'main', 4000)
    expect(span(next, 'a2')).toEqual([4000, 1000, 0])
  })

  it('moves with the clips a closed gap pulls left', () => {
    const next = closeGap(linked(), 'main', 1500)
    expect(span(next, 'v2')).toEqual([1000, 1000, 0])
    expect(span(next, 'a2')).toEqual([1000, 1000, 0])
  })

  it('trims with the video clip at either edge', () => {
    const end = trimClip(linked(), 'v1', 'end', 600)
    expect(span(end, 'a1')).toEqual([0, 600, 0])

    const start = trimClip(linked(), 'v2', 'start', 2200)
    expect(span(start, 'v2')).toEqual([2200, 800, 200])
    expect(span(start, 'a2')).toEqual([2200, 800, 200])
  })

  it('splits with the video clip and gives the right part its own audio id', () => {
    const next = splitClip(linked(), 'v1', 400, 'v1b', 'a1b')
    expect(find(next, 'v1')?.linkedAudio).toBe('a1')
    expect(find(next, 'v1b')?.linkedAudio).toBe('a1b')
    expect(span(next, 'a1')).toEqual([0, 400, 0])
    expect(span(next, 'a1b')).toEqual([400, 600, 400])
  })

  it('refuses a split of linked audio that has no id for the new part', () => {
    expect(() => splitClip(linked(), 'v1', 400, 'v1b')).toThrow(TimelineEditError)
  })

  it('is removed with its video clip', () => {
    const next = deleteClip(linked(), 'v1')
    expect(find(next, 'a1')).toBeUndefined()
    expect(find(next, 'a2')).toBeDefined()
  })

  it('refuses direct moves, trims and splits of linked audio', () => {
    expect(() => moveClip(linked(), 'a1', 'music', 500)).toThrow(TimelineEditError)
    expect(() => trimClip(linked(), 'a1', 'end', 500)).toThrow(TimelineEditError)
    expect(() => splitClip(linked(), 'a1', 500, 'x', 'y')).toThrow(TimelineEditError)
    expect(() => placeClips(linked(), ['a1'], 'music', 0)).toThrow(TimelineEditError)
  })

  it('skips linked audio in a multi-clip delete, since its video clip removes it', () => {
    const timeline = linked()
    expect(deleteClips(timeline, ['a1'])).toBe(timeline)
    expect(find(deleteClips(timeline, ['v1', 'a1']), 'a1')).toBeUndefined()
  })

  it('splits linked audio when the video clip under the playhead is split', () => {
    const next = splitClipsAt(linked(), 400, ['a1'], counter())
    expect(find(next, 'new1')?.linkedAudio).toBe('new2')
    expect(span(next, 'new2')).toEqual([400, 600, 400])
    expect(span(next, 'a1')).toEqual([0, 400, 0])
  })
})

describe('detachAudio', () => {
  function plain(): Timeline {
    return {
      tracks: [
        track('main', 'video', 'main', [clip('v', 0, 1000)]),
        track('music', 'audio', 'music', [])
      ]
    }
  }

  it('gives the audio clip the video clip span and links it', () => {
    const next = detachAudio(plain(), 'v', 'music', 'va')
    expect(span(next, 'va')).toEqual([0, 1000, 0])
    expect(find(next, 'v')?.linkedAudio).toBe('va')
  })

  it('refuses a locked audio track and leaves the timeline unchanged', () => {
    const locked: Timeline = {
      tracks: [plain().tracks[0], track('music', 'audio', 'music', [], true)]
    }
    expect(() => detachAudio(locked, 'v', 'music', 'va')).toThrow(TimelineEditError)
  })
})

describe('setClipAudio', () => {
  it('sets mute and volume on one clip and leaves the other fields alone', () => {
    const muted = setClipAudio(linked(), 'a1', { muted: true })
    expect(find(muted, 'a1')?.muted).toBe(true)
    expect(find(muted, 'a1')?.gain).toBeUndefined()

    const loud = setClipAudio(muted, 'a1', { gain: 1.5 })
    expect(find(loud, 'a1')?.gain).toBe(1.5)
    expect(find(loud, 'a1')?.muted).toBe(true)
  })

  it('refuses a volume outside 0 to 2 and a locked track', () => {
    expect(() => setClipAudio(linked(), 'a1', { gain: 3 })).toThrow(TimelineEditError)
    expect(() => setClipAudio(linked(), 'a1', { gain: Number.NaN })).toThrow(TimelineEditError)
    const locked: Timeline = {
      tracks: [linked().tracks[0], track('music', 'audio', 'music', [clip('a1', 0, 1000)], true)]
    }
    expect(() => setClipAudio(locked, 'a1', { muted: true })).toThrow(TimelineEditError)
  })
})

describe('clip sound in the preview mix and the inspector', () => {
  it('a muted clip is silent, and its volume is what the mix uses', () => {
    const timeline: Timeline = {
      tracks: [track('music', 'audio', 'music', [clip('m', 0, 1000, { muted: true, gain: 0.5 })])]
    }
    expect(clipAudioSources(timeline, 500)).toEqual([])
    const audible = setClipAudio(timeline, 'm', { muted: false })
    expect(clipAudioSources(audible, 500)[0]?.gain).toBe(0.5)
  })

  it('edits the sound clip of a single selection, and nothing for several clips', () => {
    expect(soundClipFor(linked(), ['v1'])?.id).toBe('a1')
    expect(soundClipFor(linked(), ['a2'])?.id).toBe('a2')
    expect(soundClipFor(linked(), ['v1', 'v2'])).toBeNull()
    const silent: Timeline = {
      tracks: [track('main', 'video', 'main', [clip('t', 0, 1000, { mediaId: undefined })])]
    }
    expect(soundClipFor(silent, ['t'])).toBeNull()
  })
})
