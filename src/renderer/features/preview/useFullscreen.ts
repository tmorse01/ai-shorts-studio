// Fullscreen for one element (the preview canvas), so its transport stays on screen with the frame.
// The browser's own Esc key leaves fullscreen, and this hook follows that change.
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { toast } from '../toasts/toast'

export interface FullscreenState {
  active: boolean
  toggle: () => Promise<void>
}

export function useFullscreen(ref: RefObject<HTMLElement>): FullscreenState {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () =>
      setActive(document.fullscreenElement !== null && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await ref.current?.requestFullscreen()
    } catch {
      toast.error({ title: 'Fullscreen is not available right now' })
    }
  }, [ref])

  return { active, toggle }
}
