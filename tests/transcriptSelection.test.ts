import { describe, expect, it } from 'vitest'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { sourceStore } from '@renderer/features/source/sourceStore'
import { visibleInspectorTabs } from '@renderer/features/inspector/inspectorModel'

function reset() {
  sourceStore.setState({ mode: 'short', sourceId: null, inMs: null, outMs: null, naming: false })
  playbackStore.setState({ playing: false, playheadMs: 0, rate: 1, durationMs: 10_000 })
}

describe('sourceStore.markRange', () => {
  it('sets In and Out to a transcript selection', () => {
    reset()
    sourceStore.getState().openSource('clip-a')
    sourceStore.getState().markRange(1200, 4800)
    expect(sourceStore.getState()).toMatchObject({ inMs: 1200, outMs: 4800 })
  })

  it('clamps the range to the clip length', () => {
    reset()
    sourceStore.getState().openSource('clip-a')
    sourceStore.getState().markRange(-50, 99_000)
    expect(sourceStore.getState()).toMatchObject({ inMs: 0, outMs: 10_000 })
  })

  it('does nothing outside Source view', () => {
    reset()
    sourceStore.getState().markRange(1000, 2000)
    expect(sourceStore.getState()).toMatchObject({ inMs: null, outMs: null })
  })
})

describe('visibleInspectorTabs', () => {
  it('shows the transcript tab only in Source view', () => {
    expect(visibleInspectorTabs(true)).toContain('transcript')
    expect(visibleInspectorTabs(false)).not.toContain('transcript')
    expect(visibleInspectorTabs(false)).toEqual(['video', 'audio', 'ai'])
  })
})
