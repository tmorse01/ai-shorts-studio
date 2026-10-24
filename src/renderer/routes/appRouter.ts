import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { NotFoundPage } from './NotFoundPage'
import { routeTree } from './routeTree'

export interface AppRouterOptions {
  /** Enables the dev-only UI review route. Pass true only in development builds. */
  devRoutes?: boolean
}

// The history is passed in. The app uses hash history (Electron loads from file://), and tests
// use memory history.
export function createAppRouter(history: RouterHistory, options: AppRouterOptions = {}) {
  return createRouter({
    routeTree,
    history,
    context: { devRoutes: options.devRoutes ?? false },
    defaultNotFoundComponent: NotFoundPage
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
