import { useEffect } from 'react'
import { isEditableTarget, shortcutRegistry } from './shortcutRegistry'

// Sends window keydown events to the shortcut registry. Mounted once by the app.
export function useShortcutListener() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const handled = shortcutRegistry.handle(event, {
        editable: isEditableTarget(event.target)
      })
      if (handled) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
