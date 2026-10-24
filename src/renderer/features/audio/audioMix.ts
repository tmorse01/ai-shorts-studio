// Pure audio mix rules for the preview: which footage sounds at a time, at what gain, where each
// source should be in its file, and when a playing element has drifted far enough to seek. No DOM
// or WebAudio here, so the rules are tested directly. audioGraph.ts only applies the plan.
//
// Extension hook (Epic 06 narration and music): a feature that adds sounds that are not clips on the
// timeline calls registerAudioSourceProvider with a function that returns AudioSource entries for a
// time. Each entry is played through the same graph as clip sources, with the same gain and resync.
import { clipsAt } from '@shared/timeline/resolveFrame'
import type { Timeline } from '@shared/timeline/timeline'
import { FRAME_MS } from '../playback/playbackClock'

export interface AudioSource {
  // Stable while the source plays, so the graph keeps its element. Clip sources use the clip id.
  key: string
  // The media file to play (see mediaUrl in @shared/media/previewSource).
  mediaId: string
  // Timeline position where this source's file time is anchored.
  startMs: number
  // File time that lines up with startMs. File time = sourceInMs + (timeline time - startMs).
  sourceInMs: number
  // File time to play at the current timeline time, in ms.
  sourceTimeMs: number
  // Linear gain before the master volume. 0 is silent.
  gain: number
}

export type AudioSourceProvider = (tMs: number, timeline: Timeline) => AudioSource[]

const providers = new Set<AudioSourceProvider>()

// Adds a source provider. Returns a function that removes it again.
export function registerAudioSourceProvider(provider: AudioSourceProvider): () => void {
  providers.add(provider)
  return () => {
    providers.delete(provider)
  }
}

// Clip sources at tMs: one per active clip that has footage and sits on an audio or video track.
// Muted tracks and muted clips are silent. A video clip with detached audio is silent, because its sound now plays
// from the audio clip it links to. `hasAudio` says whether a media id has a sound track at all.
export function clipAudioSources(
  timeline: Timeline,
  tMs: number,
  hasAudio: (mediaId: string) => boolean = () => true
): AudioSource[] {
  const sources: AudioSource[] = []
  for (const active of clipsAt(timeline, tMs)) {
    const { clip, trackKind, trackMuted } = active
    if (trackMuted || clip.muted || !clip.mediaId || !hasAudio(clip.mediaId)) continue
    if (trackKind !== 'audio' && trackKind !== 'video') continue
    if (trackKind === 'video' && clip.linkedAudio) continue
    sources.push({
      key: clip.id,
      mediaId: clip.mediaId,
      startMs: clip.startMs,
      sourceInMs: clip.sourceInMs,
      sourceTimeMs: clip.sourceInMs + (tMs - clip.startMs),
      gain: clip.gain ?? 1
    })
  }
  return sources
}

// Every source that should sound at tMs: clip sources followed by provider sources.
export function audioSourcesAt(
  timeline: Timeline,
  tMs: number,
  hasAudio?: (mediaId: string) => boolean
): AudioSource[] {
  const sources = clipAudioSources(timeline, tMs, hasAudio)
  for (const provider of providers) sources.push(...provider(tMs, timeline))
  return sources
}

// Which sources start, keep and stop when the plan changes. `current` holds the keys of the
// sources the graph is playing now.
export function diffAudioSources(
  current: ReadonlySet<string>,
  next: readonly AudioSource[]
): { start: AudioSource[]; keep: AudioSource[]; stop: string[] } {
  const nextKeys = new Set(next.map((source) => source.key))
  return {
    start: next.filter((source) => !current.has(source.key)),
    keep: next.filter((source) => current.has(source.key)),
    stop: [...current].filter((key) => !nextKeys.has(key))
  }
}

// The timeline time that a file time corresponds to, for a source. The playhead follows the audio
// clock through this mapping.
export function timelineMsForSource(source: AudioSource, fileTimeMs: number): number {
  return source.startMs + (fileTimeMs - source.sourceInMs)
}

// Whether an element has drifted from where the playhead says its file time should be. A drift of
// up to one frame is accepted. Past that, the element is seeked back.
export function needsResync(elementTimeMs: number, expectedTimeMs: number): boolean {
  return Math.abs(elementTimeMs - expectedTimeMs) > FRAME_MS
}

// The master volume, clamped to 0 to 1. A value that is not a number is treated as full volume.
export function clampMasterVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}
