import type { CSSProperties } from 'react'
import { cropRect, outputSize, type Caption, type Framing, type Ratio, type Segment } from '../../shared/timeline'

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

/** The caption that should be on screen at a source time, if any. */
export function activeCaption(captions: Caption[], sourceSec: number): Caption | null {
  return captions.find((c) => sourceSec >= c.startSec && sourceSec < c.endSec) ?? null
}

export type PlaybackStep = { kind: 'play' } | { kind: 'seek'; sec: number } | { kind: 'end' }

/**
 * What the player should do at a source time while a clip plays. Inside a cut it keeps playing. In a
 * gap it jumps to the next cut's start, and past the last cut it ends. Cuts are in source order, which
 * `normalizeSegments` guarantees before a short is saved.
 */
export function playbackStep(segments: Segment[], sourceSec: number): PlaybackStep {
  if (segments.length === 0) return { kind: 'end' }
  for (const s of segments) {
    if (sourceSec >= s.startSec && sourceSec < s.endSec) return { kind: 'play' }
    if (sourceSec < s.startSec) return { kind: 'seek', sec: s.startSec }
  }
  return { kind: 'end' }
}
