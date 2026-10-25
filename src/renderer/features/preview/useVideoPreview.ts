// Draws the frame at the playhead through the compositor. The renderer owns the decoder pool and the
// canvas; this hook reads the playback and media stores and reports the state the preview shows.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useStore } from 'zustand'
import type { Timeline } from '@shared/timeline/timeline'
import type { CaptionOptions } from '@shared/captions/captionLayout'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { NO_DROPPED_FRAMES, type DroppedFrameState } from '../compositor/droppedFrames'
import { mediaSourceStore } from './mediaSourceStore'
import { PreviewRenderer } from './previewRenderer'
import { usePreviewSettings } from './previewSettingsStore'

export interface VideoPreviewState {
  // True when the layer at the playhead has footage that is not on disk.
  offline: boolean
  // Frames held while playing because footage was not decoded yet. Counted in development only.
  droppedFrames: number
}

export function useVideoPreview(
  canvasRef: RefObject<HTMLCanvasElement>,
  timeline: Timeline,
  captionOptions?: CaptionOptions
): VideoPreviewState {
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const playing = usePlaybackStore((state) => state.playing)
  const useOriginals = usePreviewSettings((state) => state.useOriginals)
  const sources = useStore(mediaSourceStore, (state) => state.byId)
  const [offline, setOffline] = useState(false)
  const [dropped, setDropped] = useState<DroppedFrameState>(NO_DROPPED_FRAMES)

  const rendererRef = useRef<PreviewRenderer | null>(null)
  if (rendererRef.current === null) {
    const countDrops = import.meta.env.DEV
    rendererRef.current = new PreviewRenderer(countDrops, (count) =>
      setDropped((state) => ({ ...state, dropped: count }))
    )
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return
    setOffline(
      renderer.show({
        canvas,
        timeline,
        playheadMs,
        playing,
        useOriginals,
        sources,
        captionOptions
      }).offline
    )
  }, [timeline, playheadMs, playing, useOriginals, sources, canvasRef, captionOptions])

  // Stop the shown elements when the preview unmounts.
  useEffect(
    () => () => {
      rendererRef.current?.stop()
    },
    []
  )

  return { offline, droppedFrames: dropped.dropped }
}
