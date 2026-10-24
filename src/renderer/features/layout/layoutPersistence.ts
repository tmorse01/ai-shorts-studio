// Saves the editor layout through the IPC bridge and restores it on the next launch. Browser
// storage is not used for this (CLAUDE.md, State).
import type { StoreApi } from 'zustand/vanilla'
import type { RendererApi } from '@shared/ipc'
import type { UiLayout } from '@shared/layout'
import type { UiStore } from './uiStore'

const SAVE_DELAY_MS = 300

export interface LayoutPersistenceOptions {
  /** Runs after the saved layout is applied and before changes are saved. */
  onRestored?: () => void
}

export function layoutFromState(state: UiStore): UiLayout {
  return {
    leftTool: state.leftTool,
    panes: {
      left: { ...state.panes.left },
      right: { ...state.panes.right },
      bottom: { ...state.panes.bottom }
    }
  }
}

/**
 * Applies the saved layout to the store, then saves each later change after a short pause. Returns
 * a function that stops saving. A failed load or save keeps the current layout; toasts for those
 * failures arrive with task #27.
 */
export async function startLayoutPersistence(
  api: Pick<RendererApi, 'invoke'>,
  store: StoreApi<UiStore>,
  options: LayoutPersistenceOptions = {}
): Promise<() => void> {
  const loaded = await api.invoke('ui:layout:load', {})
  if (loaded.ok && loaded.data.layout) {
    store.setState(loaded.data.layout)
  }
  options.onRestored?.()

  let lastSaved = JSON.stringify(layoutFromState(store.getState()))
  let timer: ReturnType<typeof setTimeout> | undefined

  const unsubscribe = store.subscribe((state) => {
    const layout = layoutFromState(state)
    const json = JSON.stringify(layout)
    if (json === lastSaved) return

    clearTimeout(timer)
    timer = setTimeout(() => {
      lastSaved = json
      void api.invoke('ui:layout:save', { layout })
    }, SAVE_DELAY_MS)
  })

  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}
