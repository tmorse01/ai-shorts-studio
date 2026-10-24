import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  title: string
  description: string
  /** AI panels take the lavender ornament. */
  accent?: 'default' | 'ai'
}

// Empty panels use the display face and a hairline Art Deco ornament, kept small so the workspace
// stays the focus.
export function EmptyState({ title, description, accent = 'default' }: EmptyStateProps) {
  const ornamentClass = accent === 'ai' ? `${styles.ornament} ${styles.ai}` : styles.ornament

  return (
    <div className={styles.empty}>
      <span className={ornamentClass} aria-hidden="true" />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
    </div>
  )
}
