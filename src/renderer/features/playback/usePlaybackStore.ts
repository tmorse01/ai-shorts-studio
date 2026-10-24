import { useStore } from 'zustand'
import { playbackStore, type PlaybackStore } from './playbackStore'

// Reads the playback store through a selector, so a component renders only what it uses.
export function usePlaybackStore<T>(selector: (state: PlaybackStore) => T): T {
  return useStore(playbackStore, selector)
}
