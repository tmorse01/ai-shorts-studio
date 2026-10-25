import type { JSX } from 'react'
import { useStore } from 'zustand'
import { FolderOpen, X } from 'lucide-react'
import type { RenderJob } from '@shared/export/renderQueue'
import { formatEncodeTime } from '@shared/export/exportSettings'
import type { JobStatus } from '@shared/media/jobs'
import { IconButton } from '@renderer/ui/IconButton'
import { renderQueueStore } from './renderQueueStore'
import styles from './ExportQueuePanel.module.css'

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Waiting',
  running: 'Exporting',
  done: 'Exported',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

// The render queue (Epic 17, #152): one row per export with its progress, time left, cancel and open
// folder. Nothing shows until an export has been started in this session.
export function ExportQueuePanel(): JSX.Element | null {
  const jobs = useStore(renderQueueStore, (state) => state.jobs)
  if (jobs.length === 0) return null
  return (
    <section className={styles.queue} aria-label="Render queue">
      <h3 className={styles.title}>Render queue</h3>
      <ul className={styles.list}>
        {jobs.map((job) => (
          <QueueRow key={job.id} job={job} />
        ))}
      </ul>
    </section>
  )
}

function QueueRow({ job }: { job: RenderJob }): JSX.Element {
  const { cancel, reveal } = renderQueueStore.getState()
  const active = job.status === 'queued' || job.status === 'running'
  const percent = Math.round(job.progress * 100)
  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <span className={styles.name} title={job.fileName}>
          {job.shortName}
        </span>
        <span className={styles.actions}>
          {active && (
            <IconButton icon={X} label="Cancel export" onClick={() => void cancel(job.id)} />
          )}
          <IconButton icon={FolderOpen} label="Open folder" onClick={() => void reveal(job.id)} />
        </span>
      </div>
      <p className={styles.meta}>
        <span>{STATUS_LABELS[job.status]}</span>
        {job.status === 'running' && <span>{percent}%</span>}
        {job.status === 'running' && job.etaSec !== null && (
          <span>About {formatEncodeTime(job.etaSec)} left</span>
        )}
      </p>
      {job.status === 'running' && (
        <div
          className={styles.track}
          role="progressbar"
          aria-label={`Progress for ${job.shortName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
      )}
      {job.status === 'failed' && job.error && (
        <div className={styles.error}>
          <p className={styles.errorMessage}>{job.error.message}</p>
          {job.error.details && (
            <details>
              <summary className={styles.summary}>Details</summary>
              <pre className={styles.details}>{job.error.details}</pre>
            </details>
          )}
        </div>
      )}
    </li>
  )
}
