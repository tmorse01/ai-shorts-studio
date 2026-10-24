// Plays the timeline's sound alongside the preview. It keeps one AudioGraph, feeds it the playhead
// and the master volume, and registers the graph's clock so the playhead follows the audio while it
// plays.
import { useEffect, useMemo, useRef } from 'react'
import { useStore } from 'zustand'
import type { Timeline } from '@shared/timeline/timeline'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { setAudioClock } from '../playback/usePlaybackClock'
import { useProjectStore } from '../project/useProjectStore'
import { mediaSourceStore } from '../preview/mediaSourceStore'
import { AudioGraph } from './audioGraph'
import { useAudioSettings } from './audioSettingsStore'

export function useAudioPreview(timeline: Timeline): void {
  const graphRef = useRef<AudioGraph | null>(null)
  if (graphRef.current === null) graphRef.current = new AudioGraph()

  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const playing = usePlaybackStore((state) => state.playing)
  const masterVolume = useAudioSettings((state) => state.masterVolume)
  const media = useProjectStore((state) => state.current?.project.media ?? null)
  const sources = useStore(mediaSourceStore, (state) => state.byId)

  // Video and audio files have a sound track. Images are silent.
  const soundIds = useMemo(() => {
    const ids = new Set<string>()
    for (const ref of media ?? []) if (ref.kind !== 'image') ids.add(ref.id)
    return ids
  }, [media])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return undefined
    setAudioClock(() => graph.clockMs())
    return () => setAudioClock(null)
  }, [])

  useEffect(() => {
    graphRef.current?.update({
      timeline,
      playheadMs,
      playing,
      masterVolume,
      hasAudio: (mediaId) => soundIds.has(mediaId) && sources[mediaId]?.online !== false
    })
  }, [timeline, playheadMs, playing, masterVolume, soundIds, sources])

  useEffect(
    () => () => {
      graphRef.current?.stop()
    },
    []
  )
}
