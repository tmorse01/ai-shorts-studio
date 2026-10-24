// The export render graph (Epic 17, #149). Turns a short's timeline into one ffmpeg filter_complex string,
// so export draws the same frames and mixes the same sound as the preview. Pure: it builds text and runs
// nothing. The layout of each layer comes from describeFrame (the compositor, #78), the transition windows
// and their shape from transitions.ts, the sounding clips from audioRules.ts, and the ducking envelope from
// ducking.ts. Nothing here repeats those rules.
//
// Video: a black canvas, then each layer in draw order. A layer is trimmed to its span on the timeline
// (its clip, widened by any transition), placed with the compositor's placement, faded with the transition
// levels, and overlaid for its span. A blurFit layer first draws its blurred, dimmed cover background.
// Audio: each sounding clip is trimmed to its span, given its gains, fades and ducking, delayed to its
// start, and the clips are summed with amix.
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  describeFrame,
  type FrameLayer,
  type LayerRender,
  type Placement,
  type SourceSize
} from '../compositor/frame'
import { isSoundingClip } from '../timeline/audioRules'
import { duckEnvelope, duckingFor, narrationRanges, type EnvelopePoint } from '../timeline/ducking'
import {
  activeSpan,
  timelineDurationMs,
  transitionRoles,
  type TransitionRole
} from '../timeline/resolveFrame'
import { isCut } from '../timeline/transitions'
import type { Clip, Timeline, Track } from '../timeline/timeline'

export const DEFAULT_RENDER_FPS = 30

export interface RenderGraphOptions {
  fps?: number
  // The pixel size of a media item's source. Without it a layer fills the canvas.
  sizeOf?: (mediaId: string) => SourceSize | null
  // Whether a media item has a sound track. Without it every media item is treated as having one.
  hasAudio?: (mediaId: string) => boolean
}

export interface RenderGraph {
  // The filter_complex text. Empty when the timeline has no clips.
  filterComplex: string
  // Media ids in ffmpeg input order: input N is inputs[N] (pass them with -i, in this order).
  inputs: string[]
  // The labels to map with -map, or null when the output has no video or no sound.
  videoLabel: string | null
  audioLabel: string | null
  durationMs: number
}

// A clip that appears in the graph, with its span on the timeline. The span is wider than the clip
// when a transition reaches past its ends.
interface Item {
  track: Track
  clip: Clip
  startMs: number
  endMs: number
  roles: TransitionRole[]
  input: number
  incoming: boolean
}

// A fade the transitions apply to a clip. Video fades use the alpha channel, sound uses the gain.
interface Ramp {
  direction: 'in' | 'out'
  startMs: number
  durationMs: number
  video: boolean
}

// An overlap crossfade (loop-to-fill, see crossfade.ts): the clip sits in a window and its gain follows an
// equal-power curve. Cut transitions are not in this list. They use ramps.
interface OverlapFade {
  side: 'in' | 'out'
  startMs: number
  durationMs: number
}

// A number as ffmpeg reads it: at most six decimals, never exponent form.
function num(value: number): string {
  const fixed = Number(value.toFixed(6))
  return String(fixed === 0 ? 0 : fixed)
}

// Milliseconds as the seconds that filter options and expressions take.
function sec(ms: number): string {
  return num(ms / 1000)
}

function placementFilters(placement: Placement): string[] {
  const width = Math.max(1, Math.round(placement.width))
  const height = Math.max(1, Math.round(placement.height))
  const filters = [`scale=${width}:${height}`]
  if (placement.rotationDeg !== 0) {
    const radians = num((placement.rotationDeg * Math.PI) / 180)
    filters.push(`rotate=${radians}:c=none:ow=rotw(${radians}):oh=roth(${radians})`)
  }
  return filters
}

// Overlay position of a layer's centre. `w` and `h` are the overlay's own size, so the centre lands on
// the placement's centre.
function overlayPosition(placement: Placement): string {
  return `x=${Math.round(placement.centerX)}-w/2:y=${Math.round(placement.centerY)}-h/2`
}

// The fades one transition puts on a clip. A crossfade fades the incoming picture in and leaves the
// outgoing picture opaque. A dip fades the outgoing clip out in its first half and the incoming clip in
// over its second half. Sound follows the same windows, linearly (see transitionLevels in transitions.ts).
function transitionRamps(roles: readonly TransitionRole[]): Ramp[] {
  const ramps: Ramp[] = []
  for (const role of roles) {
    const { startMs, endMs } = role.window
    const length = endMs - startMs
    if (role.kind === 'dip-to-black') {
      if (role.role === 'out') {
        ramps.push({ direction: 'out', startMs, durationMs: length / 2, video: true })
      } else {
        const midMs = startMs + length / 2
        ramps.push({ direction: 'in', startMs: midMs, durationMs: endMs - midMs, video: true })
      }
    } else if (role.role === 'in') {
      ramps.push({ direction: 'in', startMs, durationMs: length, video: true })
    } else {
      ramps.push({ direction: 'out', startMs, durationMs: length, video: false })
    }
  }
  return ramps
}

// Overlap crossfades per clip id, from the transitions that are not cuts (see crossfade.ts).
function overlapFades(timeline: Timeline): Map<string, OverlapFade[]> {
  const clips = new Map<string, Clip>()
  for (const track of timeline.tracks) {
    for (const clip of track.clips) clips.set(clip.id, clip)
  }
  const fades = new Map<string, OverlapFade[]>()
  const add = (clipId: string, fade: OverlapFade): void => {
    fades.set(clipId, [...(fades.get(clipId) ?? []), fade])
  }
  for (const transition of timeline.transitions ?? []) {
    const from = clips.get(transition.fromClipId)
    const to = clips.get(transition.toClipId)
    if (!from || !to || isCut(from, to)) continue
    const startMs = to.startMs
    const durationMs = transition.durationMs
    add(to.id, { side: 'in', startMs, durationMs })
    add(from.id, { side: 'out', startMs, durationMs })
  }
  return fades
}

// The gain of an overlap crossfade as an ffmpeg expression of t (seconds): 1 outside the window, the
// rising sine curve for the incoming clip and the falling cosine for the outgoing one.
function overlapGainExpression(fade: OverlapFade): string {
  const start = sec(fade.startMs)
  const end = sec(fade.startMs + fade.durationMs)
  const length = sec(fade.durationMs)
  const curve = fade.side === 'in' ? 'sin' : 'cos'
  return `if(gte(t,${start})*lt(t,${end}),${curve}((t-${start})/${length}*PI/2),1)`
}

// The gain of a piecewise-linear envelope as an ffmpeg expression of t (seconds). Between two points the
// gain is linear, and outside every segment it is 1, as envelopeGainAt in ducking.ts gives it.
function envelopeExpression(points: readonly EnvelopePoint[]): string {
  let expression = '1'
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index]
    const to = points[index + 1]
    if (!from || !to || to.tMs <= from.tMs) continue
    const span = sec(to.tMs - from.tMs)
    const linear = `(${num(from.gain)}+(${num(to.gain - from.gain)})*(t-${sec(from.tMs)})/${span})`
    expression = `if(lt(t,${sec(to.tMs)}),if(gte(t,${sec(from.tMs)}),${linear},1),${expression})`
  }
  return expression
}

// The filters that give one video layer its span, placement, fades and render mode, as one chain that
// reads `input` and ends with the layer picture (or the composite of its blurred background).
function videoLayerChain(
  item: Item,
  layer: FrameLayer,
  input: string,
  out: string
): { parts: string[]; out: string } {
  const srcStartMs = item.clip.sourceInMs - (item.clip.startMs - item.startMs)
  const trim = `trim=start=${sec(srcStartMs)}:duration=${sec(item.endMs - item.startMs)},setpts=PTS-STARTPTS+${sec(item.startMs)}/TB,format=rgba`
  const fades = transitionRamps(item.roles)
    .filter((ramp) => ramp.video)
    .map(
      (ramp) => `fade=t=${ramp.direction}:st=${sec(ramp.startMs)}:d=${sec(ramp.durationMs)}:alpha=1`
    )
  const render: LayerRender = layer.render
  if (render.mode === 'direct') {
    const filters = [trim, ...placementFilters(layer.placement), ...fades]
    return { parts: [`${input}${filters.join(',')}[${out}]`], out }
  }
  const fg = `${out}fg`
  const bg = `${out}bg`
  const bgTaps = `${out}bgsrc`
  const background = [
    `scale=${Math.round(render.background.width)}:${Math.round(render.background.height)}`,
    `gblur=sigma=${num(render.blurPx)}`,
    `colorchannelmixer=rr=${num(1 - render.dim)}:gg=${num(1 - render.dim)}:bb=${num(1 - render.dim)}`,
    `crop=${CANVAS_WIDTH}:${CANVAS_HEIGHT}`
  ]
  const foreground = placementFilters(render.foreground)
  const parts = [
    `${input}${trim},split=2[${fg}src][${bgTaps}]`,
    `[${bgTaps}]${background.join(',')}[${bg}]`,
    `[${fg}src]${foreground.join(',')}[${fg}]`,
    `[${bg}][${fg}]overlay=${overlayPosition(render.foreground)}[${out}pre]`,
    `[${out}pre]${fades.join(',') || 'null'}[${out}]`
  ]
  return { parts, out }
}

// The layer the compositor draws for a clip at its start. The graph reads its placement and render mode.
function layerFor(
  timeline: Timeline,
  item: Item,
  sizeOf: (mediaId: string) => SourceSize | null
): FrameLayer {
  const layer = describeFrame(timeline, item.clip.startMs, sizeOf).layers.find(
    (candidate) => candidate.clipId === item.clip.id
  )
  if (!layer) throw new Error(`Clip ${item.clip.id} is not on the frame at its start`)
  return layer
}

// Chains for the sound of one clip. Gain, clip fades, transition ramps, overlap crossfades and ducking
// multiply, so each is its own filter in order. The chain ends delayed to the clip's span on the timeline.
function soundChain(
  item: Item,
  overlap: readonly OverlapFade[],
  duckExpression: string | null
): string[] {
  const { clip } = item
  const srcStartMs = clip.sourceInMs - (clip.startMs - item.startMs)
  const filters = [
    `atrim=start=${sec(srcStartMs)}:duration=${sec(item.endMs - item.startMs)}`,
    `asetpts=PTS-STARTPTS+${sec(item.startMs)}/TB`
  ]
  const gain = clip.gain ?? 1
  if (gain !== 1) filters.push(`volume=${num(gain)}`)
  const fadeInMs = clip.fadeInMs ?? 0
  const fadeOutMs = clip.fadeOutMs ?? 0
  if (fadeInMs > 0) filters.push(`afade=t=in:st=${sec(clip.startMs)}:d=${sec(fadeInMs)}`)
  if (fadeOutMs > 0) {
    const fadeStart = clip.startMs + clip.durationMs - fadeOutMs
    filters.push(`afade=t=out:st=${sec(fadeStart)}:d=${sec(fadeOutMs)}`)
  }
  for (const ramp of transitionRamps(item.roles)) {
    filters.push(`afade=t=${ramp.direction}:st=${sec(ramp.startMs)}:d=${sec(ramp.durationMs)}`)
  }
  for (const fade of overlap) {
    filters.push(`volume=volume='${overlapGainExpression(fade)}':eval=frame`)
  }
  if (duckExpression) filters.push(`volume=volume='${duckExpression}':eval=frame`)
  if (item.startMs > 0) filters.push(`adelay=delays=${Math.round(item.startMs)}:all=1`)
  return filters
}

// Splits each input stream that more than one item reads, so every item gets its own tap. Returns the
// split chains and a function that hands out the next tap for an input.
function tapsFor(
  kind: 'v' | 'a',
  items: readonly Item[]
): { parts: string[]; take: (input: number) => string } {
  const uses = new Map<number, number>()
  for (const item of items) uses.set(item.input, (uses.get(item.input) ?? 0) + 1)
  const pools = new Map<number, string[]>()
  const parts: string[] = []
  for (const [input, count] of uses) {
    const source = `[${input}:${kind}]`
    if (count === 1) {
      pools.set(input, [source])
      continue
    }
    const labels = Array.from({ length: count }, (_, index) => `${kind}${input}_${index}`)
    parts.push(
      `${source}${kind === 'v' ? 'split' : 'asplit'}=${count}${labels.map((label) => `[${label}]`).join('')}`
    )
    pools.set(
      input,
      labels.map((label) => `[${label}]`)
    )
  }
  return {
    parts,
    take: (input) => {
      const tap = pools.get(input)?.shift()
      if (!tap) throw new Error(`No ${kind} tap left for input ${input}`)
      return tap
    }
  }
}

// Builds the export filter graph for a short. Pure: it returns text and the input order, and runs nothing.
export function buildRenderGraph(
  timeline: Timeline,
  options: RenderGraphOptions = {}
): RenderGraph {
  const fps = options.fps ?? DEFAULT_RENDER_FPS
  const sizeOf = options.sizeOf ?? (() => null)
  const hasAudio = options.hasAudio ?? (() => true)
  const durationMs = timelineDurationMs(timeline)
  const inputs: string[] = []
  const inputOf = (mediaId: string): number => {
    const known = inputs.indexOf(mediaId)
    if (known !== -1) return known
    inputs.push(mediaId)
    return inputs.length - 1
  }
  if (durationMs === 0) {
    return { filterComplex: '', inputs, videoLabel: null, audioLabel: null, durationMs }
  }

  const roles = transitionRoles(timeline)
  const overlap = overlapFades(timeline)
  const visual: Item[] = []
  const sound: Item[] = []
  for (const track of timeline.tracks) {
    if (track.muted) continue
    const trackVisual: Item[] = []
    for (const clip of track.clips) {
      if (!clip.mediaId) continue
      const clipRoles = roles.get(clip.id) ?? []
      const span = activeSpan(clip, clipRoles)
      const isVisual = track.kind === 'video' || track.kind === 'overlay'
      const isSound = isSoundingClip(clip, track.kind, track.muted, hasAudio)
      if (!isVisual && !isSound) continue
      const item: Item = {
        track,
        clip,
        startMs: span.startMs,
        endMs: span.endMs,
        roles: clipRoles,
        input: inputOf(clip.mediaId),
        incoming: clipRoles.some((role) => role.role === 'in')
      }
      if (isVisual) trackVisual.push(item)
      if (isSound) sound.push(item)
    }
    // Within a track an incoming clip draws over the clip it replaces, as clipsAt orders it.
    visual.push(...trackVisual.sort((a, b) => Number(a.incoming) - Number(b.incoming)))
  }

  const parts: string[] = []
  const videoTaps = tapsFor('v', visual)
  const audioTaps = tapsFor('a', sound)
  parts.push(...videoTaps.parts, ...audioTaps.parts)

  // Video. Each layer draws over the composite so far, for its own span.
  parts.push(
    `color=c=black:s=${CANVAS_WIDTH}x${CANVAS_HEIGHT}:r=${num(fps)}:d=${sec(durationMs)},format=rgba[base0]`
  )
  let current = 'base0'
  visual.forEach((item, index) => {
    const layer = layerFor(timeline, item, sizeOf)
    const layerOut = `vl${index}`
    const chain = videoLayerChain(item, layer, videoTaps.take(item.input), layerOut)
    parts.push(...chain.parts)
    const position = layer.render.mode === 'direct' ? overlayPosition(layer.placement) : 'x=0:y=0'
    const next = `vc${index}`
    parts.push(
      `[${current}][${chain.out}]overlay=${position}:eof_action=pass:enable='between(t,${sec(item.startMs)},${sec(item.endMs)})'[${next}]`
    )
    current = next
  })
  parts.push(`[${current}]format=yuv420p,fps=${num(fps)}[vout]`)

  // Sound. Each sounding clip is delayed to its span and the clips are summed.
  let audioLabel: string | null = null
  if (sound.length > 0) {
    const ducking = duckingFor(timeline)
    const duckPoints = duckEnvelope(narrationRanges(timeline), ducking)
    const duckAll = envelopeExpression(duckPoints)
    const labels: string[] = []
    sound.forEach((item, index) => {
      const duckExpression = item.track.role === 'music' && duckAll !== '1' ? duckAll : null
      const chain = soundChain(item, overlap.get(item.clip.id) ?? [], duckExpression)
      const label = `al${index}`
      parts.push(`${audioTaps.take(item.input)}${chain.join(',')}[${label}]`)
      labels.push(`[${label}]`)
    })
    if (labels.length === 1) {
      parts.push(`${labels[0]}anull[aout]`)
    } else {
      parts.push(
        `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[aout]`
      )
    }
    audioLabel = '[aout]'
  }

  return {
    filterComplex: parts.join(';'),
    inputs,
    videoLabel: '[vout]',
    audioLabel,
    durationMs
  }
}
