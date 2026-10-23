import { useState } from 'react'
import { ANALYSIS_STAGES, type StageStatus } from '../../shared/pipeline-graph'
import type { Job } from '../../shared/types'
import { Modal } from '../chrome/Modal'
import { PipelineGraph } from './PipelineGraph'
import styles from './AnalysisProgressDialog.module.css'

interface AnalysisProgressDialogProps {
  job: Job
  onCancel: () => void
  /** Closes the dialog but keeps the analysis running; the footer bar keeps showing progress. */
  onMinimize: () => void
  onClose: () => void
}

const HEADING: Record<Job['status'], string> = {
  queued: 'Finding shorts',
  running: 'Finding shorts',
  completed: 'Shorts found',
  failed: 'Analysis failed',
  cancelled: 'Analysis cancelled',
  interrupted: 'Analysis interrupted'
}

/** The stage that is doing work right now, for the "now" line under the title. */
function activeStage(stages: StageStatus[]): StageStatus | undefined {
  return stages.find((s) => s.state === 'running')
}

export function AnalysisProgressDialog({
  job,
  onCancel,
  onMinimize,
  onClose
}: AnalysisProgressDialogProps) {
  const running = job.status === 'running' || job.status === 'queued'
  const [cancelRequested, setCancelRequested] = useState(false)
  const stages = job.stages ?? []
  const now = activeStage(stages)
  const nowLabel = ANALYSIS_STAGES.find((d) => d.id === now?.id)?.label
  const percent = job.status === 'completed' ? 100 : job.progress

  return (
    <Modal
      open
      size="wide"
      title={HEADING[job.status]}
      description={job.message}
      onClose={running ? onMinimize : onClose}
      footer={
        running ? (
          <>
            <button type="button" onClick={onMinimize}>
              Run in background
            </button>
            <button
              type="button"
              className="danger"
              disabled={cancelRequested}
              onClick={() => {
                setCancelRequested(true)
                onCancel()
              }}
            >
              {cancelRequested ? 'Cancelling…' : 'Cancel analysis'}
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        )
      }
    >
      <div className={styles.status}>
        <div className={styles.now} data-running={running}>
          {running && nowLabel ? (
            <>
              <span className={styles.pulse} aria-hidden="true" />
              <span>
                <strong>{nowLabel}</strong>
                {now?.detail && <span className={styles.nowDetail}> · {now.detail}</span>}
              </span>
            </>
          ) : (
            <span className="muted">
              {job.status === 'completed' ? 'Every stage finished.' : job.message}
            </span>
          )}
        </div>
        <span className={styles.percent}>{percent}%</span>
      </div>

      <div className={styles.bar} data-running={running}>
        <div className={styles.barFill} style={{ width: `${percent}%` }} />
      </div>

      {stages.length > 0 && <PipelineGraph stages={stages} />}

      {job.status === 'failed' && job.error && <div className="notice error">{job.error}</div>}
    </Modal>
  )
}
