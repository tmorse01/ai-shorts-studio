// The WebAudio side of the preview mix. Each audio source gets a hidden media element, routed through
// its own gain node into one master gain node. While an element plays it is the clock: the playhead
// follows its file time. Every other element is held to the playhead by needsResync. The rules live
// in audioMix.ts. This file only applies them.
import { mediaUrl } from '@shared/media/previewSource'
import type { Timeline } from '@shared/timeline/timeline'
import {
  audioSourcesAt,
  diffAudioSources,
  needsResync,
  timelineMsForSource,
  type AudioSource
} from './audioMix'

interface Voice {
  mediaId: string
  source: AudioSource
  element: HTMLAudioElement
  node: MediaElementAudioSourceNode
  gain: GainNode
}

export interface AudioUpdate {
  timeline: Timeline
  playheadMs: number
  playing: boolean
  masterVolume: number
  // Whether a media id has a sound track and is online. Images and offline media are silent.
  hasAudio: (mediaId: string) => boolean
}

export class AudioGraph {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Map<string, Voice>()
  private playing = false

  update(input: AudioUpdate): void {
    this.playing = input.playing
    const sources = audioSourcesAt(input.timeline, input.playheadMs, input.hasAudio)
    const diff = diffAudioSources(new Set(this.voices.keys()), sources)
    if (sources.length === 0 && this.voices.size === 0) return

    const context = this.ensureContext()
    if (!context || !this.master) return
    this.master.gain.value = input.masterVolume

    for (const key of diff.stop) this.dispose(key)
    for (const source of diff.start) this.start(context, source)
    for (const source of diff.keep) this.apply(source)

    for (const source of sources) {
      const voice = this.voices.get(source.key)
      if (!voice) continue
      voice.source = source
      if (needsResync(voice.element.currentTime * 1000, source.sourceTimeMs)) {
        voice.element.currentTime = source.sourceTimeMs / 1000
      }
      if (input.playing) {
        if (voice.element.paused) void voice.element.play().catch(() => undefined)
      } else if (!voice.element.paused) {
        voice.element.pause()
      }
    }
    if (input.playing && context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
  }

  // The timeline time the playing audio is at, or null when no element is playing. The playhead
  // uses it as its clock while it returns a time.
  clockMs(): number | null {
    if (!this.playing) return null
    for (const voice of this.voices.values()) {
      if (voice.element.paused) continue
      return timelineMsForSource(voice.source, voice.element.currentTime * 1000)
    }
    return null
  }

  // Pauses every element and removes the voices. The context stays, so the next update reuses it.
  stop(): void {
    this.playing = false
    for (const key of [...this.voices.keys()]) this.dispose(key)
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context
    if (typeof AudioContext === 'undefined') return null
    const context = new AudioContext()
    const master = context.createGain()
    master.connect(context.destination)
    this.context = context
    this.master = master
    return context
  }

  private start(context: AudioContext, source: AudioSource): void {
    const element = new Audio()
    element.preload = 'auto'
    element.src = mediaUrl(source.mediaId, 'original')
    const node = context.createMediaElementSource(element)
    const gain = context.createGain()
    node.connect(gain)
    if (this.master) gain.connect(this.master)
    this.voices.set(source.key, { mediaId: source.mediaId, source, element, node, gain })
    this.apply(source)
  }

  private apply(source: AudioSource): void {
    const voice = this.voices.get(source.key)
    if (!voice) return
    if (voice.mediaId !== source.mediaId) {
      // The clip now points at other footage, so the element is rebuilt on the next update.
      this.dispose(source.key)
      return
    }
    voice.gain.gain.value = source.gain
  }

  private dispose(key: string): void {
    const voice = this.voices.get(key)
    if (!voice) return
    voice.element.pause()
    voice.node.disconnect()
    voice.gain.disconnect()
    this.voices.delete(key)
  }
}
