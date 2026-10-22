import { useMemo, useState } from 'react'
import { validateShortDuration, type Caption, type Segment } from '../../shared/timeline'
import type { Short, ShortSettings } from '../../shared/types'

/**
 * Local, unsaved edits to one short. Saving is explicit: the caller sends `draft` to the main process
 * and this hook only tracks what differs from the saved short.
 */
export function useShortDraft(short: Short) {
  const [title, setTitle] = useState(short.title)
  const [segments, setSegments] = useState<Segment[]>(short.segments)
  const [captions, setCaptions] = useState<Caption[]>(short.captions)
  const [settings, setSettings] = useState<ShortSettings>(short.settings)

  const dirty = useMemo(
    () =>
      title !== short.title ||
      JSON.stringify(segments) !== JSON.stringify(short.segments) ||
      JSON.stringify(captions) !== JSON.stringify(short.captions) ||
      JSON.stringify(settings) !== JSON.stringify(short.settings),
    [title, segments, captions, settings, short]
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
    problem
  }
}
