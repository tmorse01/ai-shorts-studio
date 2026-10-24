import { describe, expect, it } from 'vitest'
import { createUiStore, DEFAULT_UI_STATE } from '@renderer/features/layout/uiStore'

describe('uiStore', () => {
  it('starts on the media tool with every pane open', () => {
    const state = createUiStore().getState()
    expect(state.leftTool).toBe('media')
    expect(state.panes.left.collapsed).toBe(false)
    expect(state.panes.right.collapsed).toBe(false)
    expect(state.panes.bottom.collapsed).toBe(false)
  })

  it('switches the left tool', () => {
    const store = createUiStore()
    store.getState().setLeftTool('captions')
    expect(store.getState().leftTool).toBe('captions')
  })

  it('toggles one pane and leaves its size and the other panes alone', () => {
    const store = createUiStore()
    store.getState().togglePane('right')
    expect(store.getState().panes.right).toEqual({
      size: DEFAULT_UI_STATE.panes.right.size,
      collapsed: true
    })
    expect(store.getState().panes.left.collapsed).toBe(false)

    store.getState().togglePane('right')
    expect(store.getState().panes.right.collapsed).toBe(false)
  })

  it('sets a pane collapsed state directly, so repeat calls do not flip it back', () => {
    const store = createUiStore()
    store.getState().setPaneCollapsed('left', true)
    store.getState().setPaneCollapsed('left', true)
    expect(store.getState().panes.left.collapsed).toBe(true)
    store.getState().setPaneCollapsed('left', false)
    expect(store.getState().panes.left.collapsed).toBe(false)
  })

  it('sets a pane size without changing the others', () => {
    const store = createUiStore()
    store.getState().setPaneSize('bottom', 360)
    expect(store.getState().panes.bottom.size).toBe(360)
    expect(store.getState().panes.left.size).toBe(DEFAULT_UI_STATE.panes.left.size)
  })

  it('updates state immutably through Immer, so earlier snapshots keep their values', () => {
    const store = createUiStore()
    const before = store.getState()
    store.getState().setLeftTool('audio')
    store.getState().togglePane('left')
    expect(before.leftTool).toBe('media')
    expect(before.panes.left.collapsed).toBe(false)
  })

  it('does not share state between stores created from the default', () => {
    const first = createUiStore()
    const second = createUiStore()
    first.getState().setPaneSize('left', 500)
    expect(second.getState().panes.left.size).toBe(DEFAULT_UI_STATE.panes.left.size)
    expect(DEFAULT_UI_STATE.panes.left.size).toBe(320)
  })
})
