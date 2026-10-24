import { describe, expect, it } from 'vitest'
import { createInspectorStore } from '@renderer/features/inspector/inspectorStore'

describe('inspector store', () => {
  it('opens the Video tab for the short by default', () => {
    const store = createInspectorStore()
    expect(store.getState().selectionType).toBe('short')
    expect(store.getState().tab).toBe('video')
  })

  it('moves the tab with the selection type', () => {
    const store = createInspectorStore()
    store.getState().setSelectionType('audio-clip')
    expect(store.getState().tab).toBe('audio')
    store.getState().setSelectionType('video-clip')
    expect(store.getState().tab).toBe('video')
  })

  it('keeps a tab the user picked when the selection type does not change', () => {
    const store = createInspectorStore()
    store.getState().setSelectionType('video-clip')
    store.getState().setTab('ai')
    store.getState().setSelectionType('video-clip')
    expect(store.getState().tab).toBe('ai')
  })

  it('toggles a section collapsed state by id', () => {
    const store = createInspectorStore()
    store.getState().toggleSection('transform')
    expect(store.getState().collapsed).toEqual({ transform: true })
    store.getState().toggleSection('transform')
    expect(store.getState().collapsed).toEqual({ transform: false })
  })
})
