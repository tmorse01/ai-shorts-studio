import { useState } from 'react'
import { RouterProvider, createHashHistory } from '@tanstack/react-router'
import { useShortcutListener } from './features/shortcuts/useShortcutListener'
import { ToastHost } from './features/toasts/ToastHost'
import { VisionCostDialog } from './features/ai/VisionCostDialog'
import { useProjectStore } from './features/project/useProjectStore'
import { TitleBar } from './features/layout/TitleBar'
import { createAppRouter, type AppRouterOptions } from './routes/appRouter'
import styles from './App.module.css'

export type AppProps = AppRouterOptions

export function App({ devRoutes = false }: AppProps) {
  // Created on first render, not at import: the router touches window, and the smoke test imports
  // this module under Node.
  const [router] = useState(() => createAppRouter(createHashHistory(), { devRoutes }))
  const projectName = useProjectStore((state) => state.current?.project.name ?? null)
  useShortcutListener()

  return (
    <>
      <div className={styles.frame}>
        <TitleBar projectName={projectName} />
        <div className={styles.screen}>
          <RouterProvider router={router} />
        </div>
      </div>
      <VisionCostDialog />
      <ToastHost />
    </>
  )
}
