import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { RoutePlaceholder } from './RoutePlaceholder'

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage
})

function SettingsPage(): JSX.Element {
  return (
    <RoutePlaceholder
      title="Settings"
      description="Settings arrive with their own epic. This page is a placeholder."
    />
  )
}
