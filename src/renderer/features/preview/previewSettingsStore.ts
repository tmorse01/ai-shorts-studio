// Preview settings for this editor session. "Originals" makes playback read the source files instead
// of the proxies. Kept in memory for now; it is a per-session choice, not saved project data.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface PreviewSettingsStore {
  useOriginals: boolean
  setUseOriginals: (useOriginals: boolean) => void
}

export const previewSettingsStore = createStore<PreviewSettingsStore>()((set) => ({
  useOriginals: false,
  setUseOriginals: (useOriginals) => set({ useOriginals })
}))

export function usePreviewSettings<T>(selector: (state: PreviewSettingsStore) => T): T {
  return useStore(previewSettingsStore, selector)
}
