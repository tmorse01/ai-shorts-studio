// Loads one clip's cached transcript through the analysis:transcript:read channel. It loads only once the
// transcript stage is done, and again whenever the clip's analysis version or stage status changes.
import { useEffect, useState } from 'react'
import type { Transcript } from '@shared/analysis/transcript'

export interface LoadedTranscript {
  transcript: Transcript | null | undefined
  readError?: string
}

interface Loaded {
  key: string
  transcript: Transcript | null
  readError?: string
}

export function useTranscript(
  projectFolder: string | undefined,
  mediaId: string | undefined,
  enabled: boolean,
  key: string
): LoadedTranscript {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!enabled || !projectFolder || !mediaId) return undefined
    let active = true
    window.api
      .invoke('analysis:transcript:read', { projectFolder, mediaId })
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setLoaded({ key, transcript: result.data.transcript })
        } else {
          setLoaded({ key, transcript: null, readError: 'Could not read the transcript.' })
        }
      })
      .catch(() => {
        if (active)
          setLoaded({ key, transcript: null, readError: 'Could not read the transcript.' })
      })
    return () => {
      active = false
    }
  }, [enabled, projectFolder, mediaId, key])

  if (!enabled || loaded?.key !== key) return { transcript: undefined }
  return { transcript: loaded.transcript, readError: loaded.readError }
}
