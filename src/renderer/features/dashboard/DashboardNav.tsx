import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { APP_NAME } from '@shared/app'
import styles from './DashboardNav.module.css'

// The slim left column on the dashboard only. The brand mark sits at the top and Settings at the
// bottom. The editor has its own top bar and rail, so this stays out of there.
export function DashboardNav(): JSX.Element {
  return (
    <nav className={styles.nav} aria-label="Main">
      <Link to="/" className={styles.mark} aria-label={`${APP_NAME}, projects`}>
        <span className={styles.diamond} aria-hidden="true" />
      </Link>
      <div className={styles.bottom}>
        <Link
          to="/settings"
          className={styles.item}
          activeProps={{ className: styles.itemActive }}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  )
}
