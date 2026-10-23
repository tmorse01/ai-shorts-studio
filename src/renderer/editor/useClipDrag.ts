import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** A press that travels less than this, in pixels, is a click rather than a drag. */
const DRAG_CLICK_THRESHOLD_PX = 3

export interface ClipDragHandlers<P> {
  /** Called on each move once the pointer has travelled past the click threshold. */
  onMove: (deltaPx: number, payload: P) => void
  /** Called once on release. `moved` is false for a plain click. */
  onEnd: (payload: P, moved: boolean) => void
}

interface Active<P> {
  payload: P
  startX: number
  moved: boolean
}

/**
 * One pointer-drag behaviour for every timeline item. The pointer is captured by the item, so moves keep
 * reaching it when the pointer leaves it. A press that moves less than the threshold is a click: it
 * selects, and it never seeks or changes anything. Each drag is one undo gesture.
 *
 * `bind(makePayload)` returns the handlers for one item. `makePayload` runs on press, so it can read the
 * modifier keys and the state as they are at that moment.
 */
export function useClipDrag<P>(
  handlers: ClipDragHandlers<P>,
  gestureStart: () => void,
  gestureEnd: () => void
) {
  // Read by the event handlers, which run after render, so they always see the latest callbacks.
  const latest = useRef({ handlers, gestureStart, gestureEnd })
  useEffect(() => {
    latest.current = { handlers, gestureStart, gestureEnd }
  })
  const active = useRef<Active<P> | null>(null)
  const suppressClick = useRef(false)

  const finish = (): void => {
    const a = active.current
    if (!a) return
    active.current = null
    if (a.moved) suppressClick.current = true
    latest.current.handlers.onEnd(a.payload, a.moved)
    latest.current.gestureEnd()
  }

  const bind = (makePayload: (e: ReactPointerEvent<HTMLElement>) => P) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation()
      e.preventDefault()
      active.current = { payload: makePayload(e), startX: e.clientX, moved: false }
      suppressClick.current = false
      latest.current.gestureStart()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const a = active.current
      if (!a) return
      const dx = e.clientX - a.startX
      if (!a.moved && Math.abs(dx) <= DRAG_CLICK_THRESHOLD_PX) return
      a.moved = true
      latest.current.handlers.onMove(dx, a.payload)
    },
    onPointerUp: finish,
    onPointerCancel: finish
  })

  /** True once after a drag, so the click that follows its release is ignored. */
  const consumeClick = (): boolean => {
    const was = suppressClick.current
    suppressClick.current = false
    return was
  }

  return { bind, consumeClick }
}
