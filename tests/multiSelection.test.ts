import { describe, expect, it } from 'vitest'
import { sharedProperties } from '@renderer/features/inspector/sharedProperties'
import { selectionHeaderFor } from '@renderer/features/inspector/inspectorModel'
import { soundsFor } from '@renderer/features/audio/clipSound'
import { soundValuesOf } from '@renderer/features/audio/soundValues'
import { createInspectorStore } from '@renderer/features/inspector/inspectorStore'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'media_1',
    startMs: 0,
    durationMs: 1000,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

const SOUND = { muted: false, gain: 1, fadeInMs: 0, fadeOutMs: 0 }

describe('sharedProperties', () => {
  it('returns the common value when every item agrees', () => {
    const shared = sharedProperties([SOUND, { ...SOUND }])
    expect(shared).toEqual({
      muted: { value: false, mixed: false },
      gain: { value: 1, mixed: false },
      fadeInMs: { value: 0, mixed: false },
      fadeOutMs: { value: 0, mixed: false }
    })
  })

  it('marks a property mixed when items differ, and leaves the others shared', () => {
    const shared = sharedProperties([SOUND, { ...SOUND, gain: 0.5 }])
    expect(shared?.gain).toEqual({ value: 1, mixed: true })
    expect(shared?.muted.mixed).toBe(false)
  })

  it('returns null when there are no items', () => {
    expect(sharedProperties([])).toBeNull()
  })

  it('returns null when any item has no properties to share', () => {
    expect(sharedProperties([SOUND, null])).toBeNull()
  })
})

describe('soundValuesOf', () => {
  it('fills defaults for a clip with no sound settings', () => {
    expect(soundValuesOf(clip('a'))).toEqual(SOUND)
  })

  it('reads the settings a clip carries', () => {
    expect(
      soundValuesOf(clip('a', { muted: true, gain: 0.5, fadeInMs: 200, fadeOutMs: 300 }))
    ).toEqual({
      muted: true,
      gain: 0.5,
      fadeInMs: 200,
      fadeOutMs: 300
    })
  })
})

function timeline(): Timeline {
  return {
    tracks: [
      {
        id: 'v',
        kind: 'video',
        clips: [clip('v1', { linkedAudio: 'a1' }), clip('v2'), clip('v3', { linkedAudio: 'a3' })]
      },
      {
        id: 'a',
        kind: 'audio',
        clips: [clip('a1'), clip('a3'), clip('a4', { mediaId: 'media_2' })]
      }
    ]
  } as unknown as Timeline
}

describe('soundsFor', () => {
  it('gives each video clip its linked audio, or null when detached', () => {
    expect(soundsFor(timeline(), ['v1', 'v2']).map((item) => item?.id)).toEqual(['a1', undefined])
  })

  it('gives an audio clip itself', () => {
    expect(soundsFor(timeline(), ['a4']).map((item) => item?.id)).toEqual(['a4'])
  })

  it('gives every selected item a sound when they all have one', () => {
    const sounds = soundsFor(timeline(), ['v1', 'v3', 'a4'])
    expect(sounds.map((item) => item?.id)).toEqual(['a1', 'a3', 'a4'])
  })

  it('gives null for an unknown clip', () => {
    expect(soundsFor(timeline(), ['missing'])).toEqual([null])
  })
})

describe('selectionHeaderFor', () => {
  it('reads the count and type of the selection', () => {
    expect(selectionHeaderFor('video-clip', 1)).toBe('Video clip')
    expect(selectionHeaderFor('video-clip', 5)).toBe('5 video clips')
    expect(selectionHeaderFor('audio-clip', 2)).toBe('2 audio clips')
    expect(selectionHeaderFor('short', 0)).toBe('Short')
    expect(selectionHeaderFor('gap', 1)).toBe('Gap')
    expect(selectionHeaderFor('transition', 1)).toBe('Transition')
  })
})

describe('inspector store selection count', () => {
  it('records the count, and updates it without moving the tab', () => {
    const store = createInspectorStore()
    store.getState().setSelectionType('audio-clip', 3)
    expect(store.getState().selectionCount).toBe(3)
    store.getState().setTab('ai')
    store.getState().setSelectionType('audio-clip', 1)
    expect(store.getState().selectionCount).toBe(1)
    expect(store.getState().tab).toBe('ai')
  })
})
