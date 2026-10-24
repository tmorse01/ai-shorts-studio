import { useEffect } from 'react'
import { playbackStore } from './playbackStore'
import { usePlaybackStore } from './usePlaybackStore'

// While playing, moves the playhead on requestAnimationFrame. When an audio clock is registered (the
// audio preview in Epic 06 #79), the playhead follows the audio time instead of wall time.
let audioClock: (() => number | null) | null = null

export function setAudioClock(read: (() => number | null) | null): void {
  audioClock = read
}

export function usePlaybackClock(): void {
  const playing = usePlaybackStore((state) => state.playing)

  useEffect(() => {
    if (!playing) return undefined
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      const audioTime = audioClock?.() ?? null
      if (audioTime !== null) {
        playbackStore.getState().seek(audioTime)
      } else {
        playbackStore.getState().tick(now - last)
      }
      last = now
      if (playbackStore.getState().playing) frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing])
}
