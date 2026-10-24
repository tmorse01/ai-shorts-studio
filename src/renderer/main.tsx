import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import { projectStore } from '@renderer/features/project/projectStore'
import './theme/fonts'
import './theme/tokens.css'
import './theme/base.css'

// Closing or reloading the window writes pending changes first. The renderer cannot hold the close
// until the write finishes, so this is best effort.
window.addEventListener('beforeunload', () => void projectStore.getState().flush())

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App devRoutes={import.meta.env.DEV} />
  </StrictMode>
)
