import { describe, expect, it } from 'vitest'
import type { MediaRef } from '@shared/project/schema'
import { markedRange } from '@shared/media/sourceMarks'
import { momentPayload, rangePayload } from '@shared/timeline/dragPayload'
import type { Timeline } from '@shared/timeline/timeline'
import { buildRenderGraph } from '@shared/render/renderGraph'
import { resolveFrame } from '@shared/timeline/resolveFrame'
import { appendFootageToMain } from '@renderer/features/clipFinder/clipFinderTimeline'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { setEditorPlaybackDuration, sourceStore } from '@renderer/features/source/sourceStore'

const identity = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

const media: MediaRef[] = [
  {
    id: 'clip',
    path: 'C:/Footage/clip.mp4',
    pathKind: 'absolute',
    fileName: 'clip.mp4',
    sizeBytes: 100,
    durationMs: 30_000,
    kind: 'video'
  }
]

// A short whose main track holds 3 s of footage, so the editor's playback length is 3 s.
function shortTimeline(): Timeline {
  return {
    tracks: [
      {
        id: 'main',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: [
          {
            id: 'existing',
            mediaId: 'other',
            startMs: 0,
            durationMs: 3_000,
            sourceInMs: 0,
            transform: identity
          }
        ]
      }
    ]
  }
}

// Opens the 30 s clip, marks In at 5 s and Out at 8 s, the way the source viewer does. The editor's
// timeline is 3 s long and writes its length into playback while the source is open.
function markInAndOut(): void {
  sourceStore.setState({ mode: 'short', sourceId: null, inMs: null, outMs: null, naming: false })
  playbackStore.setState({ playing: false, playheadMs: 0, rate: 1, durationMs: 0 })
  sourceStore.getState().openSource('clip')
  // The source viewer reads the file's length when it loads.
  playbackStore.getState().setDurationMs(30_000)
  // The editor's timeline writes its own length while the source is open.
  setEditorPlaybackDuration(3_000)
  playbackStore.getState().seek(5_000)
  sourceStore.getState().markInAtPlayhead()
  playbackStore.getState().seek(8_000)
  sourceStore.getState().markOutAtPlayhead()
}

function firstClip(timeline: Timeline) {
  const clip = timeline.tracks[0]?.clips.find((item) => item.id === 'new')
  if (!clip) throw new Error('the new clip is missing')
  return clip
}

describe('adding a marked In to Out range to the timeline', () => {
  it('Clip Finder button (range) keeps In at 5 s and a 3 s length', () => {
    markInAndOut()
    const range = markedRange(sourceStore.getState())
    expect(range).not.toBeNull()
    const timeline = appendFootageToMain(
      shortTimeline(),
      media,
      rangePayload('clip', range?.startMs ?? -1, range?.endMs ?? -1),
      'new'
    )
    expect(firstClip(timeline)).toMatchObject({ sourceInMs: 5000, durationMs: 3000 })
  })

  it('drag from the source viewer keeps In at 5 s and a 3 s length', () => {
    markInAndOut()
    const range = markedRange(sourceStore.getState())
    const timeline = appendFootageToMain(
      shortTimeline(),
      media,
      rangePayload('clip', range?.startMs ?? -1, range?.endMs ?? -1),
      'new'
    )
    expect(firstClip(timeline)).toMatchObject({ sourceInMs: 5000, durationMs: 3000 })
  })

  it('drag a saved moment keeps In at 5 s and a 3 s length', () => {
    markInAndOut()
    const range = markedRange(sourceStore.getState())
    const timeline = appendFootageToMain(
      shortTimeline(),
      media,
      momentPayload({
        id: 'moment-1',
        mediaId: 'clip',
        inMs: range?.startMs ?? -1,
        outMs: range?.endMs ?? -1
      }),
      'new'
    )
    expect(firstClip(timeline)).toMatchObject({
      sourceInMs: 5000,
      durationMs: 3000,
      momentId: 'moment-1'
    })
  })
})

describe('the marked range in preview and export', () => {
  it('the first frame of the clip is the frame at In in the source viewer', () => {
    markInAndOut()
    const range = markedRange(sourceStore.getState())
    const timeline = appendFootageToMain(
      shortTimeline(),
      media,
      rangePayload('clip', range?.startMs ?? -1, range?.endMs ?? -1),
      'new'
    )
    const clip = firstClip(timeline)
    const [layer] = resolveFrame(timeline, clip.startMs)
    expect(layer).toMatchObject({ clipId: 'new', mediaId: 'clip', sourceTimeMs: 5000 })
  })

  it('export trims the clip from In and keeps its 3 s length', () => {
    markInAndOut()
    const range = markedRange(sourceStore.getState())
    const timeline = appendFootageToMain(
      shortTimeline(),
      media,
      rangePayload('clip', range?.startMs ?? -1, range?.endMs ?? -1),
      'new'
    )
    const clip = firstClip(timeline)
    const graph = buildRenderGraph(timeline)
    // The export trims each video and sound clip from its source In, for its length on the timeline.
    const start = clip.startMs
    expect(graph.filterComplex).toContain(
      `trim=start=5:duration=3,setpts=PTS-STARTPTS+${start / 1000}/TB`
    )
    expect(graph.filterComplex).toContain('atrim=start=5:duration=3')
  })
})
