import { describe, expect, it } from 'vitest'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { sourceStore } from '@renderer/features/source/sourceStore'

describe('source store', () => {
  function reset() {
    sourceStore.setState({ mode: 'short', sourceId: null, inMs: null, outMs: null })
    playbackStore.setState({ playing: false, playheadMs: 0, rate: 1, durationMs: 10_000 })
  }

  it('opens a clip in Source view and clears the marks of the last clip', () => {
    reset()
    sourceStore.getState().openSource('clip-a')
    playbackStore.getState().seek(2000)
    sourceStore.getState().markInAtPlayhead()
    sourceStore.getState().openSource('clip-b')
    expect(sourceStore.getState()).toMatchObject({
      mode: 'source',
      sourceId: 'clip-b',
      inMs: null,
      outMs: null
    })
  })

  it('marks In and Out at the playhead and clears both with clearMarks', () => {
    reset()
    sourceStore.getState().openSource('clip-a')
    playbackStore.getState().seek(1000)
    sourceStore.getState().markInAtPlayhead()
    playbackStore.getState().seek(4000)
    sourceStore.getState().markOutAtPlayhead()
    expect(sourceStore.getState()).toMatchObject({ inMs: 1000, outMs: 4000 })
    sourceStore.getState().clearMarks()
    expect(sourceStore.getState()).toMatchObject({ inMs: null, outMs: null })
  })

  it('ignores marks when no source is on screen', () => {
    reset()
    playbackStore.getState().seek(1000)
    sourceStore.getState().markInAtPlayhead()
    expect(sourceStore.getState().inMs).toBeNull()
    sourceStore.getState().openSource('clip-a')
    sourceStore.getState().setMode('short')
    sourceStore.getState().markOutAtPlayhead()
    expect(sourceStore.getState().outMs).toBeNull()
  })
})
