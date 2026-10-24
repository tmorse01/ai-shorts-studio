import { useEffect } from 'react'
import { NARROW_QUERY } from './paneSizing'
import { startLayoutPersistence } from './layoutPersistence'
import { uiStore } from './useUiStore'

function collapseSidePanes() {
  const { setPaneCollapsed } = uiStore.getState()
  setPaneCollapsed('left', true)
  setPaneCollapsed('right', true)
}

// Restores the saved editor layout, saves changes, and collapses the side panes when the window is
// narrow. Mounted by the editor shell.
export function useEditorLayoutPersistence() {
  useEffect(() => {
    const narrow = window.matchMedia(NARROW_QUERY)
    const onNarrowChange = (event: MediaQueryListEvent) => {
      if (event.matches) collapseSidePanes()
    }
    narrow.addEventListener('change', onNarrowChange)

    const onRestored = () => {
      if (narrow.matches) collapseSidePanes()
    }

    let stop: (() => void) | undefined
    let cancelled = false
    if (window.api) {
      void startLayoutPersistence(window.api, uiStore, { onRestored }).then((unsubscribe) => {
        if (cancelled) unsubscribe()
        else stop = unsubscribe
      })
    } else {
      // Outside the app (for example in a plain browser) there is no bridge: nothing is saved or
      // restored, but the narrow-window rule still applies.
      onRestored()
    }

    return () => {
      cancelled = true
      narrow.removeEventListener('change', onNarrowChange)
      stop?.()
    }
  }, [])
}
