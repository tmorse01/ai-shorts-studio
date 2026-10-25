import { describe, expect, it } from 'vitest'
import type { MediaRef } from '@shared/project/schema'
import { momentPayload, rangePayload } from '@shared/timeline/dragPayload'
import type { Timeline, Track } from '@shared/timeline/timeline'
import {
  appendFootageToMain,
  mainTrackEndMs
} from '@renderer/features/clipFinder/clipFinderTimeline'

const identity = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

const media: MediaRef[] = [
  {
    id: 'clip',
    path: 'C:/Footage/clip.mp4',
    pathKind: 'absolute',
    fileName: 'clip.mp4',
    sizeBytes: 100,
    durationMs: 120_000,
    kind: 'video'
  },
  {
    id: 'song',
    path: 'C:/Music/song.mp3',
    pathKind: 'absolute',
    fileName: 'song.mp3',
    sizeBytes: 100,
    durationMs: 90_000,
    kind: 'audio'
  }
]

function mainTrack(): Track {
  return {
    id: 'main',
    kind: 'video',
    role: 'main',
    muted: false,
    clips: [
      {
        id: 'a',
        mediaId: 'clip',
        startMs: 0,
        durationMs: 4_000,
        sourceInMs: 0,
        transform: identity
      },
      {
        id: 'b',
        mediaId: 'clip',
        startMs: 4_000,
        durationMs: 2_000,
        sourceInMs: 0,
        transform: identity
      }
    ]
  }
}

function timelineWith(tracks: Track[]): Timeline {
  return { tracks }
}

describe('mainTrackEndMs', () => {
  it('is where the last clip on the main track ends', () => {
    expect(mainTrackEndMs(timelineWith([mainTrack()]))).toBe(6_000)
  })

  it('is zero when there is no main track or no clip on it', () => {
    expect(mainTrackEndMs(timelineWith([]))).toBe(0)
    expect(mainTrackEndMs(timelineWith([{ ...mainTrack(), clips: [] }]))).toBe(0)
  })
})

describe('appendFootageToMain', () => {
  it('appends a saved moment after the last clip and keeps the moment id', () => {
    const payload = momentPayload({ id: 'mom_1', mediaId: 'clip', inMs: 30_000, outMs: 42_000 })
    const next = appendFootageToMain(timelineWith([mainTrack()]), media, payload, 'new_clip')
    const added = next.tracks[0].clips.find((clip) => clip.id === 'new_clip')
    expect(added).toMatchObject({
      mediaId: 'clip',
      startMs: 6_000,
      durationMs: 12_000,
      sourceInMs: 30_000,
      momentId: 'mom_1'
    })
  })

  it('appends a plain range without a moment id', () => {
    const next = appendFootageToMain(
      timelineWith([mainTrack()]),
      media,
      rangePayload('clip', 1_000, 4_000),
      'new_clip'
    )
    const added = next.tracks[0].clips.find((clip) => clip.id === 'new_clip')
    expect(added).toMatchObject({ startMs: 6_000, durationMs: 3_000, sourceInMs: 1_000 })
    expect(added && 'momentId' in added).toBe(false)
  })

  it('does not change the timeline it was given', () => {
    const timeline = timelineWith([mainTrack()])
    appendFootageToMain(timeline, media, rangePayload('clip', 0, 1_000), 'new_clip')
    expect(timeline.tracks[0].clips).toHaveLength(2)
  })

  it('refuses audio, which cannot go on a video track', () => {
    expect(() =>
      appendFootageToMain(
        timelineWith([mainTrack()]),
        media,
        rangePayload('song', 0, 1_000),
        'new_clip'
      )
    ).toThrow('Only video files can go on a video track.')
  })

  it('refuses footage that is no longer in the project', () => {
    expect(() =>
      appendFootageToMain(
        timelineWith([mainTrack()]),
        media,
        rangePayload('gone', 0, 1_000),
        'new_clip'
      )
    ).toThrow('That file is no longer in the project.')
  })

  it('creates the main track on a new short with no tracks, then adds the clip to it', () => {
    const next = appendFootageToMain(
      timelineWith([]),
      media,
      rangePayload('clip', 0, 1_000),
      'new_clip'
    )
    const main = next.tracks.find((track) => track.role === 'main')
    expect(main?.clips.map((clip) => clip.id)).toEqual(['new_clip'])
    expect(main?.clips[0]).toMatchObject({ sourceInMs: 0, durationMs: 1_000 })
  })
})
