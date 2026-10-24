import type { ReactNode } from 'react'
import { BackButton } from './BackButton'
import styles from './RoutePlaceholder.module.css'

export interface RoutePlaceholderProps {
  title: string
  /** Editorial uses the Cormorant display face (dashboard, empty states). */
  tone?: 'editorial' | 'interface'
  description: string
  /** Shows a Back button above the heading. Off on the dashboard, which is the root. */
  back?: boolean
  actions?: ReactNode
}

// Shared shell for route placeholders. Real content replaces it in later epics.
export function RoutePlaceholder({
  title,
  tone = 'interface',
  description,
  back = true,
  actions
}: RoutePlaceholderProps) {
  const headingClass = tone === 'editorial' ? styles.editorial : styles.interface

  return (
    <main className={styles.page}>
      {back && (
        <div className={styles.back}>
          <BackButton />
        </div>
      )}
      <h1 className={headingClass}>{title}</h1>
      <p className={styles.description}>{description}</p>
      {actions && <div className={styles.actions}>{actions}</div>}
    </main>
  )
}
