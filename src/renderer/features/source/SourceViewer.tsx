// Plays the source clip in the centre pane. The video element follows the playback store: play,
// pause and seeks from the scrub bar, the frame keys and the J/K/L shuttle all reach it through that
// store. While the video plays, its clock drives the playhead. Footage is read through the same
// aism-media URLs the preview uses, so main serves only files it has registered by media id.
import { useEffect, useRef, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import { mediaUrl, chooseVariant } from '@shared/media/previewSource'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { projectStore } from '@renderer/features/project/projectStore'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { setAudioClock } from '@renderer/features/playback/usePlaybackClock'
import { mediaSourceStore } from '@renderer/features/preview/mediaSourceStore'
import { usePreviewSettings } from '@renderer/features/preview/previewSettingsStore'
import { sourceStore } from './sourceStore'
import styles from './SourceViewer.module.css'

// A playhead further than this from the video's time is a seek, so the video is moved to it.
const SEEK_TOLERANCE_MS = 50
const OFFLINE_MESSAGE = 'This file is offline. Relink it to play it.'

export function SourceViewer(): JSX.Element {
  const current = useStore(projectStore, (state) => state.current)
  const sourceId = useStore(sourceStore, (state) => state.sourceId)
  const sources = useStore(mediaSourceStore, (state) => state.byId)
  const useOriginals = usePreviewSettings((state) => state.useOriginals)
  const clip = current?.project.media.find((ref) => ref.id === sourceId)
  const info = clip ? sources[clip.id] : undefined
  const [playError, setPlayError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // The proxy plays when the clip has one, unless the user asked for originals. Main answers for
  // each media id, so the renderer never handles a path.
  const variant = chooseVariant({
    useOriginals,
    playing: true,
    proxyReady: info?.hasProxy ?? false
  })
  const url = clip && info?.online ? mediaUrl(clip.id, variant) : null
  const error = playError ?? (info?.online === false ? OFFLINE_MESSAGE : null)

  // With nothing open the playback length is zero, so the scrub bar is empty.
  useEffect(() => {
    if (sourceId !== null) return
    playbackStore.getState().pause()
    playbackStore.getState().setDurationMs(0)
  }, [sourceId])

  // A new clip or a new file clears an earlier playback error.
  useEffect(() => {
    setPlayError(null)
  }, [url])

  // Connects the video to the playback store for as long as this file is loaded.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return undefined
    setAudioClock(() => (video.paused ? null : video.currentTime * 1000))
    const unsubscribe = playbackStore.subscribe((state, previous) => {
      if (state.playing !== previous.playing || state.rate !== previous.rate) {
        // The video element cannot play backward, so reverse shuttle runs on the playhead clock.
        if (state.playing && state.rate > 0) {
          video.playbackRate = state.rate
          if (video.paused) {
            void video.play().catch(() => playbackStore.getState().pause())
          }
        } else {
          video.pause()
        }
      }
      if (Math.abs(state.playheadMs - video.currentTime * 1000) > SEEK_TOLERANCE_MS) {
        video.currentTime = state.playheadMs / 1000
      }
    })
    return () => {
      unsubscribe()
      setAudioClock(null)
      video.pause()
      playbackStore.getState().pause()
    }
  }, [url])

  if (sourceId === null) {
    return (
      <EmptyState
        title="No source open"
        description="Click a video in the Media panel to open it here."
      />
    )
  }
  if (!clip) {
    return (
      <EmptyState title="Clip not found" description="This clip is no longer in the project." />
    )
  }
  if (error !== null) {
    return <EmptyState title="Cannot play this clip" description={error} />
  }
  if (url === null) {
    return <EmptyState title="Loading clip" description="Preparing the clip for playback." />
  }

  return (
    <div className={styles.stage}>
      <video
        ref={videoRef}
        key={url}
        className={styles.video}
        src={url}
        preload="auto"
        playsInline
        aria-label={`Source: ${clip.fileName}`}
        onLoadedMetadata={(event) => {
          const { duration } = event.currentTarget
          const durationMs = Number.isFinite(duration) ? Math.round(duration * 1000) : 0
          playbackStore.getState().pause()
          playbackStore.getState().setDurationMs(durationMs)
          playbackStore.getState().seek(0)
        }}
        onEnded={() => playbackStore.getState().pause()}
        onError={() =>
          setPlayError('This file could not be played. Check that it is still on disk.')
        }
      />
    </div>
  )
}
