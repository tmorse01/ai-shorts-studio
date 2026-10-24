// Audio settings for this editor session. The master volume is in memory only: it is a per-session
// choice, not saved project data.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { clampMasterVolume } from './audioMix'

export interface AudioSettingsStore {
  // 0 to 1, applied on top of every source's clip gain.
  masterVolume: number
  setMasterVolume: (volume: number) => void
}

export const audioSettingsStore = createStore<AudioSettingsStore>()((set) => ({
  masterVolume: 1,
  setMasterVolume: (volume) => set({ masterVolume: clampMasterVolume(volume) })
}))

export function useAudioSettings<T>(selector: (state: AudioSettingsStore) => T): T {
  return useStore(audioSettingsStore, selector)
}
