// Plays the source clip in the centre pane. The video element follows the playback store: play,
// pause and seeks from the scrub bar, the frame keys and the J/K/L shuttle all reach it through that
// store. While the video plays, its clock drives the playhead.
import { useEffect, useRef, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { projectStore } from '@renderer/features/project/projectStore'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { setAudioClock } from '@renderer/features/playback/usePlaybackClock'
import { sourceStore } from './sourceStore'
import styles from './SourceViewer.module.css'

// A playhead further than this from the video's time is a seek, so the video is moved to it.
const SEEK_TOLERANCE_MS = 50

export function SourceViewer(): JSX.Element {
  const current = useStore(projectStore, (state) => state.current)
  const sourceId = useStore(sourceStore, (state) => state.sourceId)
  const clip = current?.project.media.find((ref) => ref.id === sourceId)
  const folderPath = current?.folderPath
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // With nothing open the playback length is zero, so the scrub bar is empty.
  useEffect(() => {
    if (sourceId !== null) return
    playbackStore.getState().pause()
    playbackStore.getState().setDurationMs(0)
  }, [sourceId])

  // Resolves the file to play: the proxy when the clip uses one and it is ready. Runs again when the
  // clip's path or proxy setting changes.
  useEffect(() => {
    setUrl(null)
    setError(null)
    if (!folderPath || !clip) return undefined
    let cancelled = false
    void window.api
      .invoke('media:source', { projectFolder: folderPath, media: clip })
      .then((result) => {
        if (cancelled) return
        if (result.ok) setUrl(result.data.url)
        else setError(result.error.message)
      })
    return () => {
      cancelled = true
    }
  }, [folderPath, clip])

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
        onError={() => setError('This file could not be played. Check that it is still on disk.')}
      />
    </div>
  )
}
