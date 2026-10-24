import { useState } from 'react'
import { RouterProvider, createHashHistory } from '@tanstack/react-router'
import { ToastProvider } from './ui/Toast'
import { createAppRouter, type AppRouterOptions } from './routes/appRouter'

export type AppProps = AppRouterOptions

export function App({ devRoutes = false }: AppProps) {
  // Created on first render, not at import: the router touches window, and the smoke test imports
  // this module under Node.
  const [router] = useState(() => createAppRouter(createHashHistory(), { devRoutes }))

  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
