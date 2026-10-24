import { beforeEach, describe, expect, it } from 'vitest'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { DEFAULT_PX_PER_MS } from '@renderer/features/timeline/timelineView'
import { timelineViewStore } from '@renderer/features/timeline/timelineViewStore'
import {
  captureShortViewState,
  readShortViewState,
  restoreShortViewState
} from '@renderer/features/shorts/shortViewState'

// Each test starts with fresh shorts ids, so state saved by an earlier test cannot leak in.
let sequence = 0
const nextId = () => `short-${(sequence += 1)}`

beforeEach(() => {
  playbackStore.setState({ playing: false, playheadMs: 0 })
  timelineViewStore.setState({ pxPerMs: DEFAULT_PX_PER_MS })
})

describe('short view state', () => {
  it('gives a short that was never visited the default playhead and zoom', () => {
    expect(readShortViewState(nextId())).toEqual({
      playheadMs: 0,
      pxPerMs: DEFAULT_PX_PER_MS
    })
  })

  it('brings back each short its own playhead and zoom when switching', () => {
    const a = nextId()
    const b = nextId()

    playbackStore.setState({ playheadMs: 4200 })
    timelineViewStore.setState({ pxPerMs: 0.4 })
    captureShortViewState(a)

    restoreShortViewState(b)
    expect(playbackStore.getState().playheadMs).toBe(0)
    expect(timelineViewStore.getState().pxPerMs).toBe(DEFAULT_PX_PER_MS)

    playbackStore.setState({ playheadMs: 900 })
    timelineViewStore.setState({ pxPerMs: 0.2 })
    captureShortViewState(b)

    restoreShortViewState(a)
    expect(playbackStore.getState().playheadMs).toBe(4200)
    expect(timelineViewStore.getState().pxPerMs).toBe(0.4)
  })

  it('pauses playback when a short is restored', () => {
    const a = nextId()
    playbackStore.setState({ playing: true, playheadMs: 1000 })
    captureShortViewState(a)
    restoreShortViewState(a)
    expect(playbackStore.getState().playing).toBe(false)
  })
})
