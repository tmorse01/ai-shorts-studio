import type { JSX } from 'react'
import { useInspectorStore } from './useInspectorStore'
import { selectionHeaderFor } from './inspectorModel'
import styles from './SelectionHeader.module.css'

// The line above the inspector tabs: what is selected and how many items (Epic 08, #99). Several clips
// show their count, such as "3 audio clips".
export function SelectionHeader(): JSX.Element {
  const selectionType = useInspectorStore((state) => state.selectionType)
  const count = useInspectorStore((state) => state.selectionCount)

  return (
    <div className={styles.header} aria-live="polite">
      {selectionHeaderFor(selectionType, count)}
    </div>
  )
}
