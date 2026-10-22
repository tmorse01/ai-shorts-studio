import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { estimateRemainingSec } from '../../shared/export-math'
import type { ExportItem, Job } from '../../shared/types'
import { errorText, fmt } from '../util'
import styles from './Export.module.css'

const api = window.studio

const STATUS_LABEL: Record<ExportItem['status'], string> = {
  queued: 'Waiting',
  preparing: 'Preparing…',
  encoding: 'Encoding',
  verifying: 'Checking file…',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Not exported'
}

/** Phases with no percentage yet get a moving bar instead of a frozen one. */
function isIndeterminate(item: ExportItem): boolean {
  return item.status === 'preparing' || item.status === 'verifying'
}

interface ExportProgressDialogProps {
  job: Job
  onCancel: () => void
  /** Closes the dialog but keeps the export running; the footer keeps showing progress. */
  onMinimize: () => void
  onClose: () => void
  onError: (text: string) => void
}

export function ExportProgressDialog({ job, onCancel, onMinimize, onClose, onError }: ExportProgressDialogProps) {
  const running = job.status === 'running' || job.status === 'queued'
  const failed = job.status === 'failed'
  const [cancelRequested, setCancelRequested] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const elapsedSec = Math.max(0, (now - Date.parse(job.createdAt)) / 1000)
  const remainingSec = running ? estimateRemainingSec(elapsedSec, job.progress / 100) : null
  const items = job.items ?? []
  const heading =
    job.status === 'completed'
      ? 'Export complete'
      : job.status === 'cancelled'
        ? 'Export cancelled'
        : failed
          ? 'Export failed'
          : 'Exporting'

  const act = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (err) {
      onError(errorText(err))
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && (running ? onMinimize() : onClose())}>
      <Dialog.Portal>
        {/* modal-backdrop is the marker App's keyboard shortcuts check before handling Space and arrows. */}
        <Dialog.Overlay className={`${styles.overlay} modal-backdrop`} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{heading}</Dialog.Title>
          <Dialog.Description className={styles.description}>{job.message}</Dialog.Description>

          <div className={styles.body}>
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Overall</span>
                {running && <span className="muted">{job.progress}%</span>}
              </div>
              <div className={`progress ${running && job.progress === 0 ? 'indeterminate' : ''}`}>
                <div style={{ width: `${job.status === 'completed' ? 100 : job.progress}%` }} />
              </div>
            </div>

            {failed && job.error && <div className="notice error">{job.error}</div>}

            <div className={styles.list}>
              {items.map((item) => (
                <div key={item.shortId} className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.itemStatus} data-status={item.status}>
                      {item.status === 'encoding' ? `Encoding ${item.progress}%` : STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <div className={`progress ${isIndeterminate(item) ? 'indeterminate' : ''}`}>
                    <div style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }} />
                  </div>
                  {item.status === 'done' && (
                    <div className={styles.itemActions}>
                      <button type="button" onClick={() => void act(() => api.revealExport(item.shortId))}>
                        Show in folder
                      </button>
                      <button type="button" onClick={() => void act(() => api.openExport(item.shortId))}>
                        Open
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.footer}>
            {running ? (
              <>
                <span className={styles.summary}>
                  Elapsed {fmt(elapsedSec)}
                  {remainingSec !== null && ` · about ${fmt(remainingSec)} left`}
                </span>
                <div className={styles.footerActions}>
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
                    {cancelRequested ? 'Cancelling…' : 'Cancel export'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className={styles.summary}>
                  {failed ? 'Shorts that finished are kept. The file being written was removed.' : ''}
                </span>
                <div className={styles.footerActions}>
                  <button type="button" className="primary" onClick={onClose}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
