// The placement and opacity of an image overlay at one time (Epic 13, #129). Pure: no DOM, no store. The
// preview draws the description from describeFrame, and export (Epic 17) can call the same function, so a
// given clip time gives the same place, size and opacity in both. The entry and exit maths are the text
// motions from #128 (../text/textMotion.ts), so the two kinds of overlay move alike.
import type { Clip, Timeline, Track } from '../timeline/timeline'
import type { Placement } from '../compositor/frame'
import { textMotionTransform } from '../text/textMotion'
import type { ImageItem } from './imageItem'

export interface ImageOverlayRender {
  placement: Placement
  // Opacity from 0 to 1, including the item's opacity and any transition fade.
  alpha: number
}

// The item's opacity. An item with no opacity key is fully solid.
export function imageOpacityOf(item: ImageItem): number {
  return item.opacity ?? 1
}

// Where an image overlay is at elapsedMs into its clip of durationMs. `base` is where the clip's transform
// puts the image with no motion. The motion moves it by its fraction of the canvas, scales it about its
// centre and fades it. `fade` is the transition opacity (1 when the clip is not in a transition).
export function describeImageOverlay(
  base: Placement,
  item: ImageItem,
  elapsedMs: number,
  durationMs: number,
  canvas: { width: number; height: number },
  fade = 1
): ImageOverlayRender {
  const motion = textMotionTransform(item, elapsedMs, durationMs)
  return {
    placement: {
      centerX: base.centerX + motion.dxFrac * canvas.width,
      centerY: base.centerY + motion.dyFrac * canvas.height,
      width: base.width * motion.scale,
      height: base.height * motion.scale,
      rotationDeg: base.rotationDeg
    },
    alpha: motion.alpha * imageOpacityOf(item) * fade
  }
}

// The clip with an image item, and the timeline track it sits on, or null when the clip is not an image
// overlay on an overlay track.
export function imageOverlayOf(
  timeline: Timeline,
  clipId: string
): { track: Track; clip: Clip & { imageItem: ImageItem } } | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (!clip) continue
    if (track.kind !== 'overlay' || !clip.imageItem) return null
    return { track, clip: { ...clip, imageItem: clip.imageItem } }
  }
  return null
}
