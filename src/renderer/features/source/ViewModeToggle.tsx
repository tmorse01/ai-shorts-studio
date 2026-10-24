// Switches the centre pane between the source clip (Source) and the short's preview (Short).
import type { JSX } from 'react'
import { useStore } from 'zustand'
import { sourceStore, type ViewMode } from './sourceStore'
import styles from './ViewModeToggle.module.css'

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'short', label: 'Short' }
]

export function ViewModeToggle(): JSX.Element {
  const mode = useStore(sourceStore, (state) => state.mode)
  return (
    <div className={styles.group} role="group" aria-label="Preview view">
      {VIEWS.map((view) => (
        <button
          key={view.value}
          type="button"
          className={styles.button}
          aria-pressed={mode === view.value}
          onClick={() => sourceStore.getState().setMode(view.value)}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}
