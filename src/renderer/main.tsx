import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import { ToastHost } from '@renderer/features/toasts/ToastHost'
import './theme/fonts'
import './theme/tokens.css'
import './theme/base.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
    <ToastHost />
  </StrictMode>
)
