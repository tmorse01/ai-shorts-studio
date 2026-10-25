import type { JSX } from 'react'
import { AlertTriangle, OctagonAlert } from 'lucide-react'
import type { PreflightIssue } from '@shared/export/exportPreflight'
import { canContinueExport } from '@shared/export/exportPreflight'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import styles from './ExportPreflightDialog.module.css'

export interface ExportPreflightDialogProps {
  /** The issues found before the export. The dialog is open while there are any. */
  issues: PreflightIssue[] | null
  onContinue: () => void
  onCancel: () => void
}

// Lists the problems found before a render starts. The user continues or cancels; a blocking issue
// leaves only Cancel (DESIGN.md section 12, #153).
export function ExportPreflightDialog({
  issues,
  onContinue,
  onCancel
}: ExportPreflightDialogProps): JSX.Element {
  const open = issues !== null
  const continuable = issues !== null && canContinueExport(issues)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title="Check before export"
      description={
        continuable
          ? 'These problems may affect the export. Continue anyway?'
          : 'Fix these problems before exporting.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          {continuable && (
            <Button variant="primary" onClick={onContinue}>
              Continue export
            </Button>
          )}
        </>
      }
    >
      <ul className={styles.list}>
        {(issues ?? []).map((issue, index) => {
          const Icon = issue.blocking ? OctagonAlert : AlertTriangle
          return (
            <li
              key={`${issue.shortId}-${issue.kind}-${index}`}
              className={issue.blocking ? styles.blocking : styles.warning}
            >
              <Icon size={16} aria-hidden="true" className={styles.icon} />
              <span>
                <span className={styles.name}>{issue.shortName}</span> {issue.message}
              </span>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
