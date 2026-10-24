import type { JSX } from 'react'
import { createRoute, useRouter } from '@tanstack/react-router'
import { Button } from '../ui/Button'
import { rootRoute } from './rootRoute'
import { RoutePlaceholder } from './RoutePlaceholder'

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage
})

function DashboardPage(): JSX.Element {
  const router = useRouter()

  return (
    <RoutePlaceholder
      title="Projects"
      tone="editorial"
      description="Your projects appear here. The gallery arrives with epic 02."
      back={false}
      actions={
        <Button variant="secondary" onClick={() => void router.navigate({ to: '/settings' })}>
          Settings
        </Button>
      }
    />
  )
}
