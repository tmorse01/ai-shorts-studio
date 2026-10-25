import { APP_NAME } from '@shared/app'
import styles from './TitleBar.module.css'

export interface TitleBarProps {
  /** The open project's name, shown in the centre of the strip. */
  projectName?: string | null
}

// The strip above every screen: the brand mark and wordmark on the left, the open project's name in
// the middle. The window draws its own min, max and close buttons over the right end, so the strip
// leaves that space clear. The strip is a drag region. Any interactive child added later needs
// `-webkit-app-region: no-drag`.
export function TitleBar({ projectName }: TitleBarProps) {
  return (
    <header className={styles.strip}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.wordmark}>{APP_NAME}</span>
      </div>
      {projectName ? (
        <span className={styles.project} title={projectName}>
          {projectName}
        </span>
      ) : null}
    </header>
  )
}
