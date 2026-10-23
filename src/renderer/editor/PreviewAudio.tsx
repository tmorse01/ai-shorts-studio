import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Segment } from '../../shared/timeline'
import { outputTimeAt } from './preview-math'

export interface PreviewAudioProps {
  /** The source video. Its audio goes through the same graph so ducking can follow the speech. */
  videoRef: RefObject<HTMLVideoElement>
  segments: Segment[]
  /** Null when the short has no music bed. */
  musicUrl: string | null
  musicVolume: number
  musicDuck: boolean
  narrationUrl: string | null
}

/** Music gain while speech is present. Close to the export's sidechain at ratio 6. */
const DUCK_GAIN = 0.4
/** RMS level above which the source counts as speech. Matches the export's sidechain threshold. */
const DUCK_THRESHOLD = 0.03
const ATTACK_SEC = 0.02
const RELEASE_SEC = 0.4
/** A side track is pulled back onto the video's timeline when it drifts further than this. */
const DRIFT_SEC = 0.15

interface Graph {
  ctx: AudioContext
  /** Speech: the source video and the narration. Feeds the analyser that drives ducking. */
  voice: GainNode
  analyser: AnalyserNode
  /** The music bed, scaled by its volume and the duck gain. */
  music: GainNode
}

/**
 * One AudioContext for the page. A media element can be wrapped in a source node only once, so the
 * source nodes are cached per element.
 */
let graph: Graph | null = null
const sourceNodes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

function audioGraph(): Graph {
  if (graph) return graph
  const ctx = new AudioContext()
  const voice = ctx.createGain()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  const music = ctx.createGain()
  voice.connect(analyser)
  voice.connect(ctx.destination)
  music.connect(ctx.destination)
  graph = { ctx, voice, analyser, music }
  return graph
}

function sourceOf(ctx: AudioContext, el: HTMLMediaElement): MediaElementAudioSourceNode {
  let node = sourceNodes.get(el)
  if (!node) {
    node = ctx.createMediaElementSource(el)
    sourceNodes.set(el, node)
  }
  return node
}

function setSource(el: HTMLAudioElement, url: string | null): void {
  if (el.getAttribute('src') === url) return
  if (url) el.src = url
  else el.removeAttribute('src')
  el.load()
}

/**
 * Hold a side track at a position on the output timeline. Music loops, as the export's `-stream_loop`
 * does. Narration stops at its own end.
 */
function follow(el: HTMLAudioElement, target: number, loop: boolean, playing: boolean): void {
  if (!el.getAttribute('src')) return
  const length = el.duration
  const known = Number.isFinite(length) && length > 0
  if (!loop && known && target >= length) {
    el.pause()
    return
  }
  const at = loop && known ? target % length : target
  if (Math.abs(el.currentTime - at) > DRIFT_SEC) el.currentTime = at
  if (playing && el.paused) void el.play().catch(() => undefined)
  else if (!playing && !el.paused) el.pause()
}

/**
 * Plays the music bed and the recorded narration alongside the preview video, so the preview hears what
 * the export mixes. The video keeps skipping gaps between cuts; these tracks follow the output timeline,
 * which has no gaps. Renders nothing.
 */
export function PreviewAudio({ videoRef, segments, musicUrl, musicVolume, musicDuck, narrationUrl }: PreviewAudioProps) {
  const [music] = useState(() => new Audio())
  const [narration] = useState(() => new Audio())
  // Read by the listeners and the ducking loop, so a settings change never re-wires the graph.
  const live = useRef({ segments, musicVolume, musicDuck })

  useEffect(() => {
    live.current = { segments, musicVolume, musicDuck }
  }, [segments, musicVolume, musicDuck])

  useEffect(() => setSource(music, musicUrl), [music, musicUrl])
  useEffect(() => setSource(narration, narrationUrl), [narration, narrationUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const g = audioGraph()
    const videoNode = sourceOf(g.ctx, video)
    const narrationNode = sourceOf(g.ctx, narration)
    const musicNode = sourceOf(g.ctx, music)
    videoNode.connect(g.voice)
    narrationNode.connect(g.voice)
    musicNode.connect(g.music)

    const sync = (): void => {
      const target = outputTimeAt(live.current.segments, video.currentTime)
      const playing = !video.paused && !video.ended
      follow(music, target, true, playing)
      follow(narration, target, false, playing)
    }
    const onPlay = (): void => {
      void g.ctx.resume()
      sync()
    }
    const onPause = (): void => {
      music.pause()
      narration.pause()
    }
    const onRate = (): void => {
      music.playbackRate = video.playbackRate
      narration.playbackRate = video.playbackRate
    }
    // The video's mute and volume controls also cover the narration, which is recorded speech. The music
    // bed only follows mute, so its level stays under the Music volume setting.
    const onVolume = (): void => {
      music.muted = video.muted
      narration.muted = video.muted
      narration.volume = video.volume
    }

    const listeners: [EventTarget, string, () => void][] = [
      [video, 'play', onPlay],
      [video, 'pause', onPause],
      [video, 'seeked', sync],
      [video, 'timeupdate', sync],
      [video, 'ratechange', onRate],
      [video, 'volumechange', onVolume],
      [music, 'loadedmetadata', sync],
      [narration, 'loadedmetadata', sync]
    ]
    for (const [target, type, fn] of listeners) target.addEventListener(type, fn)
    onVolume()
    onRate()

    // Ducking: an analyser on the speech drives the music gain. Fast attack, slow release, like the export.
    const samples = new Float32Array(g.analyser.fftSize)
    let gain = 1
    let last = performance.now()
    let frame = 0
    const duck = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      g.analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const x of samples) sum += x * x
      const speech = Math.sqrt(sum / samples.length) > DUCK_THRESHOLD
      const target = live.current.musicDuck && speech ? DUCK_GAIN : 1
      const tau = target < gain ? ATTACK_SEC : RELEASE_SEC
      gain += (target - gain) * (1 - Math.exp(-dt / tau))
      g.music.gain.value = live.current.musicVolume * gain
      frame = requestAnimationFrame(duck)
    }
    frame = requestAnimationFrame(duck)

    return () => {
      cancelAnimationFrame(frame)
      for (const [target, type, fn] of listeners) target.removeEventListener(type, fn)
      videoNode.disconnect()
      narrationNode.disconnect()
      musicNode.disconnect()
      music.pause()
      narration.pause()
    }
  }, [videoRef, music, narration])

  return null
}
