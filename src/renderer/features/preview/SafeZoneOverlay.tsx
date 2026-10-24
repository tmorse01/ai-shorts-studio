import type { JSX } from 'react'
import type { ShortPlatform } from '@shared/project/schema'
import { safeZoneInsets } from '@shared/preview/previewView'
import styles from './SafeZoneOverlay.module.css'

export interface SafeZoneOverlayProps {
  platform: ShortPlatform
}

// The guide area for a platform, drawn over the frame. It is a DOM overlay, so it never reaches the
// exported video, and it takes no pointer events.
export function SafeZoneOverlay({ platform }: SafeZoneOverlayProps): JSX.Element {
  const insets = safeZoneInsets(platform)
  return (
    <div className={styles.overlay} aria-hidden="true">
      <div
        className={styles.zone}
        style={{
          left: `${insets.left * 100}%`,
          right: `${insets.right * 100}%`,
          top: `${insets.top * 100}%`,
          bottom: `${insets.bottom * 100}%`
        }}
      />
    </div>
  )
}
