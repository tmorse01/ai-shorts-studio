import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react'
import { validateShortDuration, type Caption, type Segment } from '../../shared/timeline'
import type { Short, ShortSettings } from '../../shared/types'

/** Undo steps kept per short. Older steps are dropped. */
const HISTORY_LIMIT = 200
/** Edits to the same labelled control within this many ms share one undo step, such as a slider drag. */
const MERGE_MS = 1000

/** Shorts saved before a music setting existed have no value for it. Read them as the default. */
function withDefaults(s: ShortSettings): ShortSettings {
  return { ...s, musicClips: s.musicClips ?? [] }
}

interface Doc {
  title: string
  segments: Segment[]
  captions: Caption[]
  settings: ShortSettings
}

interface History {
  doc: Doc
  past: Doc[]
  future: Doc[]
}

/** Resolve a value or an updater, as React's own setters do. */
function resolve<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(prev) : action
}

/**
 * Local, unsaved edits to one short, with undo and redo. Saving is explicit: the caller sends `draft` to
 * the main process and this hook only tracks what differs from the saved short.
 *
 * An edit made during a gesture (a timeline drag) is one undo step, however many moves it takes. An edit
 * labelled with the same string as the previous one, within MERGE_MS, joins that step, so a slider or a
 * run of typing undoes in one go. Any other edit is its own step, and a new edit clears redo.
 */
export function useShortDraft(short: Short) {
  const saved = useMemo(() => withDefaults(short.settings), [short.settings])
  const [history, setHistory] = useState<History>(() => ({
    doc: { title: short.title, segments: short.segments, captions: short.captions, settings: saved },
    past: [],
    future: []
  }))
  // The latest history, read synchronously by edits that arrive before React re-renders.
  const ref = useRef(history)
  const gesture = useRef<{ armed: boolean } | null>(null)
  const last = useRef<{ label: string; at: number } | null>(null)

  const write = useCallback((next: History): void => {
    ref.current = next
    setHistory(next)
  }, [])

  const edit = useCallback(
    (change: (d: Doc) => Doc, label: string | null): void => {
      const cur = ref.current
      const nextDoc = change(cur.doc)
      if (nextDoc === cur.doc) return
      let pushPast: boolean
      const g = gesture.current
      if (g) {
        // The first change in a gesture records the step; the rest of the gesture joins it.
        pushPast = g.armed
        g.armed = false
      } else {
        const now = Date.now()
        const prev = last.current
        const merge = label !== null && prev?.label === label && now - (prev?.at ?? 0) < MERGE_MS
        pushPast = !merge
        last.current = { label: label ?? '', at: now }
      }
      write({
        doc: nextDoc,
        past: pushPast ? [...cur.past, cur.doc].slice(-HISTORY_LIMIT) : cur.past,
        future: []
      })
    },
    [write]
  )

  const setTitle = useCallback(
    (value: string, label: string | null = null): void => edit((d) => (d.title === value ? d : { ...d, title: value }), label),
    [edit]
  )

  const setSegments = useCallback(
    (action: SetStateAction<Segment[]>, label: string | null = null): void =>
      edit((d) => {
        const next = resolve(action, d.segments)
        return next === d.segments ? d : { ...d, segments: next }
      }, label),
    [edit]
  )

  const setCaptions = useCallback(
    (action: SetStateAction<Caption[]>, label: string | null = null): void =>
      edit((d) => {
        const next = resolve(action, d.captions)
        return next === d.captions ? d : { ...d, captions: next }
      }, label),
    [edit]
  )

  const setSettings = useCallback(
    (action: SetStateAction<ShortSettings>, label: string | null = null): void =>
      edit((d) => {
        const next = resolve(action, d.settings)
        return next === d.settings ? d : { ...d, settings: next }
      }, label),
    [edit]
  )

  /** Start of a drag or similar. Every edit until endGesture is one undo step. */
  const beginGesture = useCallback((): void => {
    gesture.current = { armed: true }
    last.current = null
  }, [])

  const endGesture = useCallback((): void => {
    gesture.current = null
    last.current = null
  }, [])

  const undo = useCallback((): void => {
    const cur = ref.current
    const prev = cur.past[cur.past.length - 1]
    if (!prev) return
    gesture.current = null
    last.current = null
    write({ doc: prev, past: cur.past.slice(0, -1), future: [cur.doc, ...cur.future] })
  }, [write])

  const redo = useCallback((): void => {
    const cur = ref.current
    const next = cur.future[0]
    if (!next) return
    gesture.current = null
    last.current = null
    write({ doc: next, past: [...cur.past, cur.doc].slice(-HISTORY_LIMIT), future: cur.future.slice(1) })
  }, [write])

  const { title, segments, captions, settings } = history.doc

  const dirty = useMemo(
    () =>
      title !== short.title ||
      JSON.stringify(segments) !== JSON.stringify(short.segments) ||
      JSON.stringify(captions) !== JSON.stringify(short.captions) ||
      JSON.stringify(settings) !== JSON.stringify(saved),
    [title, segments, captions, settings, short, saved]
  )
  const problem = validateShortDuration(segments)

  return {
    title,
    setTitle,
    segments,
    setSegments,
    captions,
    setCaptions,
    settings,
    setSettings,
    dirty,
    problem,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    beginGesture,
    endGesture
  }
}
