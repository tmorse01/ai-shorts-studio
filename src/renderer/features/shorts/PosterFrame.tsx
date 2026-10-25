import { useState, type JSX, type ReactNode } from 'react'
import { ImageOff, LoaderCircle } from 'lucide-react'
import type { PosterView } from './posterRequests'
import styles from './PosterFrame.module.css'

export interface PosterFrameProps {
  view: PosterView
  // Alt text for the poster image. Empty when the name sits beside it, so screen readers skip it.
  alt: string
  // The action on the empty state (the Edit thumbnail button). Not shown on a loaded poster.
  emptyAction?: ReactNode
}

// A short's poster at 9:16 in one of four states: the frame when ready, a spinner while the poster job
// runs, and the empty state when there is no poster or the image failed to load. A failed image never
// shows the browser's broken-image icon: it falls back to the empty state.
export function PosterFrame({ view, alt, emptyAction }: PosterFrameProps): JSX.Element {
  // The source that failed. A new source gets a fresh try, so the failure is compared by value.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (view.status === 'loading') {
    return (
      <div className={styles.frame} data-state="loading" role="status">
        <span className={styles.skeleton} aria-hidden="true" />
        <LoaderCircle className={styles.spinner} size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.srOnly}>Making the poster frame</span>
      </div>
    )
  }

  if (view.status === 'ready' && failedSrc !== view.src) {
    return (
      <div className={styles.frame} data-state="loaded">
        <img
          className={styles.image}
          src={view.src}
          alt={alt}
          draggable={false}
          onError={() => setFailedSrc(view.src)}
        />
      </div>
    )
  }

  return (
    <div className={styles.frame} data-state="empty">
      <div className={styles.empty}>
        <ImageOff className={styles.icon} size={20} strokeWidth={1.75} aria-hidden="true" />
        <p className={styles.label}>No poster yet</p>
        {emptyAction && <div className={styles.action}>{emptyAction}</div>}
      </div>
    </div>
  )
}
