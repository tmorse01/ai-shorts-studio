import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import './theme/fonts'
import './theme/tokens.css'
import './theme/base.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App devRoutes={import.meta.env.DEV} />
  </StrictMode>
)
