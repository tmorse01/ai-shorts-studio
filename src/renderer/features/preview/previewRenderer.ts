// Drives the preview canvas for the playhead. It cues the next clip starts in a pool of hidden video
// elements, works out which element each video layer draws from, seeks and plays those elements, and
// hands the frame description to the compositor. Frames are drawn again when an element seeks or
// loads, so a paused frame updates as soon as its pixels are ready.
import { describeFrame, type SourceSize } from '@shared/compositor/frame'
import { chooseVariant, mediaUrl } from '@shared/media/previewSource'
import type { MediaSourceInfo } from '@shared/media/mediaSources'
import type { Timeline } from '@shared/timeline/timeline'
import { resolveFrame } from '@shared/timeline/resolveFrame'
import { Compositor } from '../compositor/compositor'
import { createFrameBackend, type BitmapSource } from '../compositor/frameBackend'
import { layerFrameStore } from '../compositor/layerFrameStore'
import type { LayerSource } from '../compositor/layerRenderers'
import {
  NO_DROPPED_FRAMES,
  recordFrameDraw,
  type DroppedFrameState
} from '../compositor/droppedFrames'
import { DecoderPool } from './decoderPool'
import { needsSeek, planPreloads, topVideoLayerAt } from './previewFrame'

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

export interface ShowInput {
  canvas: HTMLCanvasElement
  timeline: Timeline
  playheadMs: number
  playing: boolean
  useOriginals: boolean
  sources: Record<string, MediaSourceInfo>
}

interface LatestFrame {
  timeline: Timeline
  playheadMs: number
  playing: boolean
  // The element each video clip draws from, for this frame.
  elementByClip: Map<string, HTMLVideoElement>
  elementByMedia: Map<string, HTMLVideoElement>
  // The loaded image each image overlay draws, by clip and by media id.
  imageByClip: Map<string, HTMLImageElement>
  imageByMedia: Map<string, HTMLImageElement>
}

export class PreviewRenderer {
  private readonly pool: DecoderPool<HTMLVideoElement>
  private compositor: Compositor | null = null
  private compositorCanvas: HTMLCanvasElement | null = null
  private shown = new Set<HTMLVideoElement>()
  // One image element per image media item, kept after use. Overlays draw from it once it has loaded.
  private readonly images = new Map<string, HTMLImageElement>()
  private latest: LatestFrame | null = null
  private dropped: DroppedFrameState = NO_DROPPED_FRAMES

  // `countDrops` is on in development only. `onDroppedChange` runs when the count changes.
  constructor(
    private readonly countDrops: boolean,
    private readonly onDroppedChange: (dropped: number) => void = () => undefined
  ) {
    this.pool = new DecoderPool(() => {
      const video = createPreviewVideo()
      video.addEventListener('seeked', this.redraw)
      video.addEventListener('loadeddata', this.redraw)
      return video
    }, POOL_SIZE)
  }

  // Shows the frame at the playhead. Returns whether the top video layer is offline, so the preview
  // can say so.
  show(input: ShowInput): { offline: boolean } {
    const { canvas, timeline, playheadMs, playing, useOriginals, sources } = input
    if (!this.compositor || this.compositorCanvas !== canvas) {
      this.compositor = new Compositor(createFrameBackend(canvas))
      this.compositorCanvas = canvas
    }

    // Cue the next clip starts with the variant they will play in.
    for (const target of planPreloads(timeline, playheadMs, PRELOAD_LOOKAHEAD)) {
      const info = sources[target.mediaId]
      if (!info || !info.online) continue
      const variant = chooseVariant({ useOriginals, playing: true, proxyReady: info.hasProxy })
      const video = this.pool.acquire(mediaUrl(target.mediaId, variant))
      const sourceSec = target.sourceMs / 1000
      if (needsSeek(video.currentTime, sourceSec, false)) video.currentTime = sourceSec
    }

    // A video layer with footage that is not on disk shows the offline placeholder. It hides the
    // layers below it, so the frame is cleared.
    const top = topVideoLayerAt(timeline, playheadMs)
    const offline = top?.mediaId !== undefined && sources[top.mediaId]?.online === false
    if (offline) {
      this.pauseExcept(new Set())
      this.setLatest({
        timeline,
        playheadMs,
        playing: false,
        elementByClip: new Map(),
        elementByMedia: new Map(),
        imageByClip: new Map(),
        imageByMedia: new Map()
      })
      this.draw()
      return { offline: true }
    }

    const elementByClip = new Map<string, HTMLVideoElement>()
    const elementByMedia = new Map<string, HTMLVideoElement>()
    for (const layer of resolveFrame(timeline, playheadMs)) {
      if (layer.trackKind !== 'video' || !layer.mediaId) continue
      const info = sources[layer.mediaId]
      if (!info || !info.online) continue
      const variant = chooseVariant({ useOriginals, playing, proxyReady: info.hasProxy })
      const video = this.pool.acquire(mediaUrl(layer.mediaId, variant))
      const sourceSec = layer.sourceTimeMs / 1000
      if (needsSeek(video.currentTime, sourceSec, playing)) video.currentTime = sourceSec
      if (playing) {
        if (video.paused) void video.play().catch(() => undefined)
      } else {
        video.pause()
      }
      elementByClip.set(layer.clipId, video)
      elementByMedia.set(layer.mediaId, video)
    }
    // Image overlays are on overlay tracks. Each draws from its image element, which loads once.
    const imageByClip = new Map<string, HTMLImageElement>()
    const imageByMedia = new Map<string, HTMLImageElement>()
    for (const layer of resolveFrame(timeline, playheadMs)) {
      if (layer.trackKind !== 'overlay' || !layer.mediaId) continue
      const info = sources[layer.mediaId]
      if (!info || !info.online) continue
      const image = this.imageFor(layer.mediaId)
      imageByClip.set(layer.clipId, image)
      imageByMedia.set(layer.mediaId, image)
    }
    this.pauseExcept(new Set(elementByClip.values()))
    this.setLatest({
      timeline,
      playheadMs,
      playing,
      elementByClip,
      elementByMedia,
      imageByClip,
      imageByMedia
    })
    this.draw()
    return { offline: false }
  }

  // Stops playback of every element on screen. Called when the preview unmounts.
  stop(): void {
    this.pauseExcept(new Set())
    this.latest = null
  }

  private readonly redraw = (): void => {
    this.draw()
  }

  // The image element for a media item, started loading the first time it is asked for.
  private imageFor(mediaId: string): HTMLImageElement {
    const known = this.images.get(mediaId)
    if (known) return known
    const image = new Image()
    image.addEventListener('load', this.redraw)
    image.src = mediaUrl(mediaId, 'original')
    this.images.set(mediaId, image)
    return image
  }

  private setLatest(latest: LatestFrame): void {
    this.latest = latest
    this.shown = new Set(latest.elementByClip.values())
  }

  private pauseExcept(keep: ReadonlySet<HTMLVideoElement>): void {
    for (const video of this.shown) {
      if (!keep.has(video)) video.pause()
    }
  }

  private draw(): void {
    const latest = this.latest
    const compositor = this.compositor
    if (!latest || !compositor) return
    const frame = describeFrame(
      latest.timeline,
      latest.playheadMs,
      (mediaId) =>
        sizeOf(latest.elementByMedia.get(mediaId)) ?? imageSizeOf(latest.imageByMedia.get(mediaId))
    )
    layerFrameStore.getState().setFrame(frame)
    const drawn = compositor.render(
      frame,
      (layer): LayerSource => {
        const video = latest.elementByClip.get(layer.clipId)
        if (!video || video.error) return { state: 'none' }
        if (video.readyState < 2 || video.videoWidth === 0) return { state: 'pending' }
        return { state: 'ready', element: video }
      },
      (layer): BitmapSource | null => readyImage(latest.imageByClip.get(layer.clipId))
    )
    if (this.countDrops) {
      const next = recordFrameDraw(this.dropped, {
        nowMs: performance.now(),
        playing: latest.playing,
        drawn
      })
      if (next.dropped !== this.dropped.dropped) this.onDroppedChange(next.dropped)
      this.dropped = next
    }
  }
}

function sizeOf(video: HTMLVideoElement | undefined): SourceSize | null {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null
  return { width: video.videoWidth, height: video.videoHeight }
}

// The pixel size of an image once it has decoded, or null while it has not.
function imageSizeOf(image: HTMLImageElement | undefined): SourceSize | null {
  if (!readyImage(image)) return null
  return { width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 }
}

// The image when it has decoded, else null. A layer with no ready image draws nothing.
function readyImage(image: HTMLImageElement | undefined): HTMLImageElement | null {
  return image && image.complete && image.naturalWidth > 0 ? image : null
}
