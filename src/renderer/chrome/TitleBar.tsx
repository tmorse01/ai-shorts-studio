import type { ReactNode } from 'react'
import { Mark } from './Mark'
import styles from './TitleBar.module.css'

export interface TitleBarProps {
  /** The application menus, rendered after the brand. */
  menu: ReactNode
  projectName: string | null
  /** Name of the video open in the editor, or null. */
  sourceName: string | null
  sourceMissing: boolean
  /** Short status for the running job, or null when idle. */
  jobLabel: string | null
  jobProgress: number
}

/**
 * Custom title bar. Electron draws the window controls over the right edge (titleBarOverlay), so the
 * right side keeps a gutter for them. The whole bar drags the window except the interactive parts.
 */
export function TitleBar({ menu, projectName, sourceName, sourceMissing, jobLabel, jobProgress }: TitleBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <Mark size={18} />
        <span className={styles.appName}>AI Shorts Studio</span>
        {menu}
      </div>

      <div className={styles.project} title={projectName ?? undefined}>
        {projectName && <span className={styles.projectName}>{projectName}</span>}
        {sourceName && <span className={styles.sourceName}>· {sourceName}</span>}
        {sourceMissing && <span className={styles.warn}>Video missing</span>}
      </div>

      <div className={styles.jobs} aria-live="polite">
        {jobLabel ? (
          <span className={styles.job}>
            {jobLabel} · {jobProgress}%
          </span>
        ) : (
          <span className={styles.idle}>Idle</span>
        )}
      </div>
    </header>
  )
}
