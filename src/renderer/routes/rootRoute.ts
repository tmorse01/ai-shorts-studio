import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

export interface RouterContext {
  /** Set from the app entry. Only development builds pass true. */
  devRoutes: boolean
}

// The root has no chrome of its own yet. The layout shell (task #25) wraps the Outlet.
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet
})
