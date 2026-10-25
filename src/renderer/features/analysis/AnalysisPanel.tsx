// The Analysis panel: each selected source with its stages, and what to do about them. A running or
// waiting stage can be cancelled; a failed one shows its reason and Retry. The panel only shows state
// and forwards the two actions, so the work itself stays in analysisSync.
import type { JSX } from 'react'
import {
  recordSummary,
  type AnalysisFile,
  type AnalysisStageStatus
} from '@shared/analysis/analysis'
import type { JobSnapshot } from '@shared/media/jobs'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { analysisJobFor, stageRows } from './analysisProgress'
import styles from './AnalysisPanel.module.css'

const STATUS_TEXT: Record<AnalysisStageStatus, string> = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped'
}

export interface AnalysisPanelBodyProps {
  sources: readonly MediaRef[]
  file: AnalysisFile | undefined
  jobs: Readonly<Record<string, JobSnapshot>>
  onCancel: (ref: MediaRef) => void
  onRetry: (ref: MediaRef) => void
}

/** The list of sources and their stages. Exported on its own so it can be tested without the dialog. */
export function AnalysisPanelBody({
  sources,
  file,
  jobs,
  onCancel,
  onRetry
}: AnalysisPanelBodyProps): JSX.Element {
  if (sources.length === 0) {
    return <p className={styles.empty}>Select footage to see its analysis.</p>
  }
  return (
    <ul className={styles.list}>
      {sources.map((ref) => {
        const record = file?.records[ref.id]
        const job = analysisJobFor(jobs, ref.fileName)
        const busy =
          job !== undefined ||
          (record ? ['running', 'pending'].includes(recordSummary(record)) : false)
        return (
          <li key={ref.id} className={styles.source}>
            <div className={styles.header}>
              <span className={styles.name}>{ref.fileName}</span>
              {busy ? (
                <Button variant="ghost" size="sm" onClick={() => onCancel(ref)}>
                  Cancel
                </Button>
              ) : null}
            </div>
            {record ? (
              <ol className={styles.stages}>
                {stageRows(record, job).map((row) => (
                  <li key={row.stage} className={styles.stage} data-status={row.status}>
                    <span className={styles.stageName}>{row.name}</span>
                    <span className={styles.stageStatus}>
                      {STATUS_TEXT[row.status]}
                      {row.percent !== undefined ? ` ${row.percent}%` : ''}
                    </span>
                    {row.error ? <span className={styles.error}>{row.error}</span> : null}
                    {row.status === 'failed' ? (
                      <Button variant="ghost" size="sm" onClick={() => onRetry(ref)}>
                        Retry
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>Not analyzed yet.</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export interface AnalysisPanelProps extends AnalysisPanelBodyProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AnalysisPanel(props: AnalysisPanelProps): JSX.Element {
  const { open, onOpenChange, ...body } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Analysis">
      <AnalysisPanelBody {...body} />
    </Dialog>
  )
}
