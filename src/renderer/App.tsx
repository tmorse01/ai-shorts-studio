import { useState } from 'react'
import { RouterProvider, createHashHistory } from '@tanstack/react-router'
import { useShortcutListener } from './features/shortcuts/useShortcutListener'
import { ToastHost } from './features/toasts/ToastHost'
import { createAppRouter, type AppRouterOptions } from './routes/appRouter'

export type AppProps = AppRouterOptions

export function App({ devRoutes = false }: AppProps) {
  // Created on first render, not at import: the router touches window, and the smoke test imports
  // this module under Node.
  const [router] = useState(() => createAppRouter(createHashHistory(), { devRoutes }))
  useShortcutListener()

  return (
    <>
      <RouterProvider router={router} />
      <ToastHost />
    </>
  )
}
