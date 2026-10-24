import { describe, expect, it } from 'vitest'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { sourceStore } from '@renderer/features/source/sourceStore'

describe('source store', () => {
  function reset() {
    sourceStore.setState({ mode: 'short', sourceId: null, inMs: null, outMs: null, naming: false })
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

  it('opens a saved moment with its range marked and the playhead at In', () => {
    reset()
    sourceStore.getState().openSource('clip-a')
    sourceStore.getState().openRange('clip-b', 3000, 8000)
    expect(sourceStore.getState()).toMatchObject({
      mode: 'source',
      sourceId: 'clip-b',
      inMs: 3000,
      outMs: 8000
    })
    expect(playbackStore.getState().playheadMs).toBe(3000)
  })

  it('opens the name prompt only when both marks are set', () => {
    reset()
    sourceStore.getState().openSource('clip-a')
    sourceStore.getState().startNamingMoment()
    expect(sourceStore.getState().naming).toBe(false)
    playbackStore.getState().seek(1000)
    sourceStore.getState().markInAtPlayhead()
    playbackStore.getState().seek(4000)
    sourceStore.getState().markOutAtPlayhead()
    sourceStore.getState().startNamingMoment()
    expect(sourceStore.getState().naming).toBe(true)
  })

  it('closes the name prompt when the marks change or the clip changes', () => {
    reset()
    sourceStore.getState().openRange('clip-a', 1000, 4000)
    sourceStore.getState().startNamingMoment()
    sourceStore.getState().clearMarks()
    expect(sourceStore.getState().naming).toBe(false)
    sourceStore.getState().openRange('clip-a', 1000, 4000)
    sourceStore.getState().startNamingMoment()
    sourceStore.getState().openSource('clip-b')
    expect(sourceStore.getState().naming).toBe(false)
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
