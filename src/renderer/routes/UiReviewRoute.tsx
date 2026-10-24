import { createRoute, notFound } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { UiReviewPage } from './UiReviewPage'

// Dev-only review sheet for the UI primitives (#21). Production builds treat it as not found.
export const uiReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/ui',
  beforeLoad: ({ context }) => {
    if (!context.devRoutes) throw notFound()
  },
  component: UiReviewPage
})
