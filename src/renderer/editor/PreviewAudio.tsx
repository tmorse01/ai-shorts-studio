import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Segment } from '../../shared/timeline'
import { outputTimeAt } from './preview-math'

/** A piece of a music track as the preview plays it. `url` is the library track it plays from. */
export interface PreviewMusicClip {
  id: string
  url: string
  startSec: number
  trackStartSec: number
  lengthSec: number
}

export interface PreviewAudioProps {
  /** The source video. Its audio goes through the same graph so ducking can follow the speech. */
  videoRef: RefObject<HTMLVideoElement>
  segments: Segment[]
  musicClips: PreviewMusicClip[]
  musicVolume: number
  musicDuck: boolean
  /** Null when the short has no narration. */
  narrationUrl: string | null
}

/** Music gain while speech is present. Close to the export's sidechain at ratio 6. */
const DUCK_GAIN = 0.4
/** RMS level above which the source counts as speech. Matches the export's sidechain threshold. */
const DUCK_THRESHOLD = 0.03
const ATTACK_SEC = 0.02
const RELEASE_SEC = 0.4
/** A track is pulled back onto the video's timeline when it drifts further than this. */
const DRIFT_SEC = 0.15

interface Graph {
  ctx: AudioContext
  /** Speech: the source video and the narration. Feeds the analyser that drives ducking. */
  voice: GainNode
  analyser: AnalyserNode
  /** All music pieces, scaled by their volume and the duck gain. */
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

/** Hold a track at a position in its file, and play or pause it to match the video. */
function follow(el: HTMLAudioElement, at: number, playing: boolean): void {
  if (Math.abs(el.currentTime - at) > DRIFT_SEC) el.currentTime = at
  if (playing && el.paused) void el.play().catch(() => undefined)
  else if (!playing && !el.paused) el.pause()
}

/** Narration follows the output timeline and stops at its own end. */
function followNarration(el: HTMLAudioElement, target: number, playing: boolean): void {
  if (!el.getAttribute('src')) return
  const length = el.duration
  if (Number.isFinite(length) && length > 0 && target >= length) {
    el.pause()
    return
  }
  follow(el, target, playing)
}

/**
 * Plays the music pieces and the recorded narration alongside the preview video, so the preview hears
 * what the export mixes. The video keeps skipping gaps between cuts; these tracks follow the output
 * timeline, which has no gaps. Renders nothing.
 */
export function PreviewAudio({ videoRef, segments, musicClips, musicVolume, musicDuck, narrationUrl }: PreviewAudioProps) {
  const [narration] = useState(() => new Audio())
  // One element per music piece, so each piece starts and stops at its own place on the timeline.
  const musicEls = useRef(new Map<string, HTMLAudioElement>())
  // Read by the listeners and the ducking loop, so a settings change never re-wires the graph.
  const live = useRef({ segments, musicClips, musicVolume, musicDuck })
  // Set by the wiring effect, so a settings change can re-sync the tracks straight away.
  const syncRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    live.current = { segments, musicClips, musicVolume, musicDuck }
    syncRef.current?.()
  }, [segments, musicClips, musicVolume, musicDuck])

  useEffect(() => setSource(narration, narrationUrl), [narration, narrationUrl])

  // Keep one element per piece. A piece that is gone is stopped and released.
  useEffect(() => {
    const g = audioGraph()
    const els = musicEls.current
    const wanted = new Set(musicClips.map((c) => c.id))
    for (const [id, el] of els) {
      if (wanted.has(id)) continue
      el.pause()
      sourceOf(g.ctx, el).disconnect()
      els.delete(id)
    }
    for (const clip of musicClips) {
      let el = els.get(clip.id)
      if (!el) {
        el = new Audio()
        el.preload = 'auto'
        el.addEventListener('loadedmetadata', () => syncRef.current?.())
        sourceOf(g.ctx, el).connect(g.music)
        els.set(clip.id, el)
      }
      // A new piece takes the video's mute and speed, so it matches the rest.
      const video = videoRef.current
      if (video) {
        el.muted = video.muted
        el.playbackRate = video.playbackRate
      }
      setSource(el, clip.url)
    }
    syncRef.current?.()
  }, [musicClips, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const g = audioGraph()
    const videoNode = sourceOf(g.ctx, video)
    const narrationNode = sourceOf(g.ctx, narration)
    videoNode.connect(g.voice)
    narrationNode.connect(g.voice)

    const sync = (): void => {
      const target = outputTimeAt(live.current.segments, video.currentTime)
      const playing = !video.paused && !video.ended
      for (const clip of live.current.musicClips) {
        const el = musicEls.current.get(clip.id)
        if (!el) continue
        const local = target - clip.startSec
        if (local >= 0 && local < clip.lengthSec) follow(el, clip.trackStartSec + local, playing)
        else if (!el.paused) el.pause()
      }
      followNarration(narration, target, playing)
    }
    syncRef.current = sync

    const onPlay = (): void => {
      void g.ctx.resume()
      sync()
    }
    const onPause = (): void => {
      for (const el of musicEls.current.values()) el.pause()
      narration.pause()
    }
    const onRate = (): void => {
      for (const el of musicEls.current.values()) el.playbackRate = video.playbackRate
      narration.playbackRate = video.playbackRate
    }
    // The video's mute and volume controls also cover the narration, which is recorded speech. The music
    // only follows mute, so its level stays under the Music volume setting.
    const onVolume = (): void => {
      for (const el of musicEls.current.values()) el.muted = video.muted
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
      syncRef.current = null
      cancelAnimationFrame(frame)
      for (const [target, type, fn] of listeners) target.removeEventListener(type, fn)
      videoNode.disconnect()
      narrationNode.disconnect()
      narration.pause()
    }
  }, [videoRef, narration])

  // Leaving the editor stops every piece.
  useEffect(
    () => () => {
      for (const el of musicEls.current.values()) el.pause()
    },
    []
  )

  return null
}
