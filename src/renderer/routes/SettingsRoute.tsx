import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { AiSettingsSection } from '@renderer/features/ai/AiSettingsSection'
import { rootRoute } from './rootRoute'
import styles from './SettingsRoute.module.css'

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage
})

// Settings are added one section at a time. Cloud AI comes first.
function SettingsPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <AiSettingsSection />
    </main>
  )
}
