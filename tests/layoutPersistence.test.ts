import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RendererApi } from '@shared/ipc'
import type { UiLayout } from '@shared/layout'
import {
  layoutFromState,
  startLayoutPersistence
} from '@renderer/features/layout/layoutPersistence'
import { createUiStore, DEFAULT_UI_STATE } from '@renderer/features/layout/uiStore'

const saved: UiLayout = {
  leftTool: 'audio',
  panes: {
    left: { size: 400, collapsed: false },
    right: { size: 260, collapsed: true },
    bottom: { size: 180, collapsed: false }
  }
}

function fakeApi(load: UiLayout | null = null) {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'ui:layout:load') {
      return { ok: true as const, data: { layout: load } }
    }
    return { ok: true as const, data: { saved: true as const } }
  })
  return { invoke: invoke as unknown as RendererApi['invoke'], calls: invoke }
}

describe('layout persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies a saved layout to the store on start', async () => {
    const store = createUiStore()
    await startLayoutPersistence(fakeApi(saved), store)
    expect(layoutFromState(store.getState())).toEqual(saved)
  })

  it('keeps the defaults when nothing was saved', async () => {
    const store = createUiStore()
    await startLayoutPersistence(fakeApi(null), store)
    expect(layoutFromState(store.getState())).toEqual(layoutFromState(createUiStore().getState()))
    expect(store.getState().leftTool).toBe(DEFAULT_UI_STATE.leftTool)
  })

  it('does not save the layout it just restored', async () => {
    const api = fakeApi(saved)
    const store = createUiStore()
    await startLayoutPersistence(api, store)
    vi.advanceTimersByTime(1000)
    expect(api.calls).toHaveBeenCalledTimes(1)
    expect(api.calls).toHaveBeenCalledWith('ui:layout:load', {})
  })

  it('saves a change once, after the pause, and not for each step', async () => {
    const api = fakeApi(null)
    const store = createUiStore()
    await startLayoutPersistence(api, store)

    store.getState().setPaneSize('left', 350)
    store.getState().setPaneSize('left', 360)
    store.getState().setLeftTool('captions')
    expect(api.calls).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(300)
    expect(api.calls).toHaveBeenLastCalledWith('ui:layout:save', {
      layout: {
        leftTool: 'captions',
        panes: {
          left: { size: 360, collapsed: false },
          right: DEFAULT_UI_STATE.panes.right,
          bottom: DEFAULT_UI_STATE.panes.bottom
        }
      }
    })
    expect(api.calls).toHaveBeenCalledTimes(2)
  })

  it('stops saving after the returned function runs', async () => {
    const api = fakeApi(null)
    const store = createUiStore()
    const stop = await startLayoutPersistence(api, store)
    stop()
    store.getState().togglePane('bottom')
    vi.advanceTimersByTime(1000)
    expect(api.calls).toHaveBeenCalledTimes(1)
  })

  it('runs onRestored after the saved layout is applied', async () => {
    const store = createUiStore()
    const onRestored = vi.fn(() => {
      expect(store.getState().leftTool).toBe('audio')
    })
    await startLayoutPersistence(fakeApi(saved), store, { onRestored })
    expect(onRestored).toHaveBeenCalledTimes(1)
  })
})
