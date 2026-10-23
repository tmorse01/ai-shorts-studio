import type { CSSProperties } from 'react'
import { cropRect, cutEnd, outputSize, type Caption, type Framing, type Ratio, type TimelineCut } from '../../shared/timeline'

/** Aspect ratio of the output frame, as CSS `width / height`. `original` follows the source. */
export function frameAspect(ratio: Ratio, source: { width: number; height: number }): number {
  const size = outputSize(ratio, source)
  return size.width / size.height
}

/**
 * Inline style that shows the crop window inside the frame. The video is scaled and offset with
 * percentages so the crop fills the frame, the same region the export keeps. Fit mode letterboxes.
 */
export function videoStyle(
  framing: Framing,
  ratio: Ratio,
  source: { width: number; height: number }
): CSSProperties {
  const crop = cropRect(source, ratio, framing)
  if (!crop) {
    return { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }
  }
  return {
    position: 'absolute',
    width: `${(source.width / crop.width) * 100}%`,
    height: `${(source.height / crop.height) * 100}%`,
    left: `${-(crop.x / crop.width) * 100}%`,
    top: `${-(crop.y / crop.height) * 100}%`,
    objectFit: 'fill'
  }
}

/** The caption on screen at a timeline time, if any. Captions are stored on the timeline, after export remapping. */
export function activeCaption(captions: Caption[], timelineSec: number): Caption | null {
  return captions.find((c) => timelineSec >= c.startSec && timelineSec < c.endSec) ?? null
}

/** The cut playing at a timeline time, or -1 over blank space. Cuts never overlap, so there is at most one. */
export function cutAt(cuts: TimelineCut[], timelineSec: number): number {
  return cuts.findIndex((c) => timelineSec >= c.atSec && timelineSec < cutEnd(c))
}

/** The first cut that starts at or after a timeline time, or -1 when none does. */
export function nextCutAt(cuts: TimelineCut[], timelineSec: number): number {
  let best = -1
  cuts.forEach((c, i) => {
    if (c.atSec >= timelineSec && (best < 0 || c.atSec < cuts[best].atSec)) best = i
  })
  return best
}
