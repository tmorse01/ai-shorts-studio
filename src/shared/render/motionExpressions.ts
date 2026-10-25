// Per-frame motion for the export graph (Epic 17, #150). An image overlay moves, scales and fades during its
// entry and exit. The graph cannot call the preview's functions, so it samples describeImageOverlay at each
// frame of the clip and writes the samples as piecewise-linear ffmpeg expressions of time. The samples come
// from the same description the preview draws, so a frame moves the same way in both. Pure: text only.
import { CANVAS_HEIGHT, CANVAS_WIDTH, placeTransform, type SourceSize } from '../compositor/frame'
import { describeImageOverlay } from '../image/imageOverlay'
import type { Clip } from '../timeline/timeline'

// A number as ffmpeg reads it: at most six decimals, never exponent form.
export function num(value: number): string {
  const fixed = Number(value.toFixed(6))
  return String(fixed === 0 ? 0 : fixed)
}

// Milliseconds as the seconds that filter options and expressions take.
export function sec(ms: number): string {
  return num(ms / 1000)
}

// One sample of a curve: its value at a time in milliseconds on the timeline.
export interface TimedValue {
  ms: number
  value: number
}

// The samples that define a piecewise-linear curve. The first and last sample are always kept. An
// interior sample is kept only where the value changes next to it, so a flat stretch costs two keys.
export function curveKeys(samples: readonly TimedValue[]): TimedValue[] {
  return samples.filter((sample, index) => {
    if (index === 0 || index === samples.length - 1) return true
    const before = samples[index - 1]
    const after = samples[index + 1]
    return sample.value !== before?.value || sample.value !== after?.value
  })
}

// An ffmpeg expression of `variable` (seconds on the timeline) that follows the keys linearly. Before the
// first key it holds the first value, and after the last key the last value. `T` is geq's time variable
// and `t` is the time of the other filters.
export function curveExpression(keys: readonly TimedValue[], variable: 't' | 'T' = 't'): string {
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (!first || !last) return '0'
  let chain = num(last.value)
  for (let index = keys.length - 2; index >= 0; index -= 1) {
    const from = keys[index]
    const to = keys[index + 1]
    if (!from || !to || to.ms <= from.ms) continue
    const linear = `(${num(from.value)}+(${num(to.value - from.value)})*(${variable}-${sec(from.ms)})/${sec(to.ms - from.ms)})`
    chain = `if(lt(${variable},${sec(to.ms)}),${linear},${chain})`
  }
  return `if(lt(${variable},${sec(first.ms)}),${num(first.value)},${chain})`
}

// The per-frame motion of an image overlay as expressions. Positions are canvas pixels at the centre, sizes
// are pixels, and alpha is 0 to 1. `alpha` is null when the picture stays fully opaque for its whole clip.
export interface ImageMotion {
  centreX: string
  centreY: string
  width: string
  height: string
  alpha: string | null
}

// The motion of an image overlay clip, sampled once per frame at fps. Null for a clip with no image item.
// Outside the sampled span the expressions hold the rest pose, which is what describeImageOverlay gives
// there. Times in the expressions are absolute timeline seconds, because the image is re-timed to the
// timeline before the graph reads them.
export function imageOverlayMotion(
  clip: Clip,
  source: SourceSize | null,
  fps: number
): ImageMotion | null {
  const item = clip.imageItem
  if (!item || clip.durationMs <= 0) return null
  const base = placeTransform(clip.transform, source)
  const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
  const stepMs = 1000 / fps
  const samples: {
    ms: number
    centreX: number
    centreY: number
    width: number
    height: number
    alpha: number
  }[] = []
  for (let elapsed = 0; ; elapsed += stepMs) {
    const at = Math.min(elapsed, clip.durationMs)
    const render = describeImageOverlay(base, item, at, clip.durationMs, canvas)
    samples.push({
      ms: clip.startMs + at,
      centreX: render.placement.centerX,
      centreY: render.placement.centerY,
      width: render.placement.width,
      height: render.placement.height,
      alpha: render.alpha
    })
    if (at >= clip.durationMs) break
  }
  const curve = (pick: (sample: (typeof samples)[number]) => number): string =>
    curveExpression(
      curveKeys(samples.map((sample) => ({ ms: sample.ms, value: pick(sample) }))),
      't'
    )
  const alphaAlwaysOpaque = samples.every((sample) => sample.alpha >= 1)
  return {
    centreX: curve((sample) => sample.centreX),
    centreY: curve((sample) => sample.centreY),
    width: curve((sample) => sample.width),
    height: curve((sample) => sample.height),
    alpha: alphaAlwaysOpaque
      ? null
      : curveExpression(
          curveKeys(samples.map((sample) => ({ ms: sample.ms, value: sample.alpha }))),
          'T'
        )
  }
}
