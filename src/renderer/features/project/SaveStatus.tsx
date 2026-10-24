import type { JSX } from 'react'
import { Check, CircleAlert, Loader2 } from 'lucide-react'
import { Button } from '@renderer/ui/Button'
import { useProjectStore } from './useProjectStore'
import styles from './SaveStatus.module.css'

// Toolbar readout for autosave: Saved, Saving… or Save failed, with Retry and the error details.
export function SaveStatus(): JSX.Element {
  const status = useProjectStore((state) => state.saveStatus)
  const flush = useProjectStore((state) => state.flush)

  if (status.kind === 'error') {
    return (
      <div className={styles.failed} role="status" aria-live="polite">
        <CircleAlert className={styles.icon} size={14} aria-hidden="true" />
        <span>{status.message}</span>
        {status.details && (
          <details className={styles.details}>
            <summary>Details</summary>
            <code>{status.details}</code>
          </details>
        )}
        <Button size="sm" variant="secondary" onClick={() => void flush()}>
          Retry
        </Button>
      </div>
    )
  }

  if (status.kind === 'saving') {
    return (
      <div className={styles.saving} role="status" aria-live="polite">
        <Loader2 className={styles.spinner} size={14} aria-hidden="true" />
        <span>Saving…</span>
      </div>
    )
  }

  return (
    <div className={styles.saved} role="status" aria-live="polite">
      <Check className={styles.icon} size={14} aria-hidden="true" />
      <span>Saved</span>
    </div>
  )
}
