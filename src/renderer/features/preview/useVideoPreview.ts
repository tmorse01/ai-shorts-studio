// Draws the topmost video frame at the playhead. Frames come from a pool of hidden video elements, so
// the next clips are cued before the playhead reaches them. While playing, the proxy plays (unless
// "Originals" is on). While paused, the frame is drawn from the original file.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useStore } from 'zustand'
import { chooseVariant, mediaUrl } from '@shared/media/previewSource'
import type { Timeline } from '@shared/timeline/timeline'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { DecoderPool } from './decoderPool'
import { mediaSourceStore } from './mediaSourceStore'
import { needsSeek, planPreloads, topVideoLayerAt } from './previewFrame'
import { usePreviewSettings } from './previewSettingsStore'

// How many clip starts ahead of the playhead are cued, and how many video elements the pool holds.
export const PRELOAD_LOOKAHEAD = 2
export const POOL_SIZE = 6

function createPreviewVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  // Audio belongs to the audio preview, not this pool. The element is never added to the page.
  video.muted = true
  video.preload = 'auto'
  video.playsInline = true
  return video
}

function drawFrame(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const dpr = window.devicePixelRatio || 1
  const width = Math.round(canvas.clientWidth * dpr)
  const height = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  // Keep the last frame until the new one is ready, so playback does not flash to blank.
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return
  context.clearRect(0, 0, width, height)
  // Fit the frame inside the canvas and keep its aspect ratio.
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight)
  const drawWidth = video.videoWidth * scale
  const drawHeight = video.videoHeight * scale
  context.drawImage(
    video,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  )
}

function clearCanvas(canvas: HTMLCanvasElement | null): void {
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

export interface VideoPreviewState {
  // True when the layer at the playhead has footage that is not on disk.
  offline: boolean
}

export function useVideoPreview(
  canvasRef: RefObject<HTMLCanvasElement>,
  timeline: Timeline
): VideoPreviewState {
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const playing = usePlaybackStore((state) => state.playing)
  const useOriginals = usePreviewSettings((state) => state.useOriginals)
  const sources = useStore(mediaSourceStore, (state) => state.byId)
  const [offline, setOffline] = useState(false)

  // The element on screen, and the pool. Frames drawn on seek or load go through drawIfShown.
  const shownRef = useRef<HTMLVideoElement | null>(null)
  const poolRef = useRef<DecoderPool<HTMLVideoElement> | null>(null)
  if (poolRef.current === null) {
    poolRef.current = new DecoderPool(() => {
      const video = createPreviewVideo()
      const drawIfShown = () => {
        if (canvasRef.current && shownRef.current === video) {
          drawFrame(canvasRef.current, video)
        }
      }
      video.addEventListener('seeked', drawIfShown)
      video.addEventListener('loadeddata', drawIfShown)
      return video
    }, POOL_SIZE)
  }

  useEffect(() => {
    const pool = poolRef.current
    if (!pool) return
    const canvas = canvasRef.current

    // Cue the next clip starts with the variant they will play in.
    for (const target of planPreloads(timeline, playheadMs, PRELOAD_LOOKAHEAD)) {
      const info = sources[target.mediaId]
      if (!info || !info.online) continue
      const variant = chooseVariant({ useOriginals, playing: true, proxyReady: info.hasProxy })
      const video = pool.acquire(mediaUrl(target.mediaId, variant))
      const sourceSec = target.sourceMs / 1000
      if (needsSeek(video.currentTime, sourceSec, false)) video.currentTime = sourceSec
    }

    const layer = topVideoLayerAt(timeline, playheadMs)
    const previous = shownRef.current
    if (!layer || !layer.mediaId) {
      previous?.pause()
      shownRef.current = null
      clearCanvas(canvas)
      setOffline(false)
      return
    }

    const info = sources[layer.mediaId]
    if (info && !info.online) {
      previous?.pause()
      shownRef.current = null
      clearCanvas(canvas)
      setOffline(true)
      return
    }
    setOffline(false)
    if (!info) return

    const variant = chooseVariant({ useOriginals, playing, proxyReady: info.hasProxy })
    const video = pool.acquire(mediaUrl(layer.mediaId, variant))
    if (previous && previous !== video) previous.pause()
    shownRef.current = video

    const sourceSec = layer.sourceTimeMs / 1000
    if (needsSeek(video.currentTime, sourceSec, playing)) video.currentTime = sourceSec
    if (playing) {
      if (video.paused) void video.play().catch(() => undefined)
    } else {
      video.pause()
    }
    if (canvas) drawFrame(canvas, video)
  }, [timeline, playheadMs, playing, useOriginals, sources, canvasRef])

  // Stop the shown element when the preview unmounts.
  useEffect(
    () => () => {
      shownRef.current?.pause()
      shownRef.current = null
    },
    []
  )

  return { offline }
}
