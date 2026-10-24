// Preview settings for this editor session. "Originals" makes playback read the source files instead
// of the proxies. Zoom and the safe-zone overlay are per-session view choices too. Kept in memory for
// now; none of it is saved project data.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { ZoomMode } from '@shared/preview/previewView'

export interface PreviewSettingsStore {
  useOriginals: boolean
  setUseOriginals: (useOriginals: boolean) => void
  zoom: ZoomMode
  setZoom: (zoom: ZoomMode) => void
  // The safe-zone overlay choice made in this session. Null follows the short's setting.
  safeZoneOverride: boolean | null
  setSafeZoneOverride: (show: boolean | null) => void
}

export const previewSettingsStore = createStore<PreviewSettingsStore>()((set) => ({
  useOriginals: false,
  setUseOriginals: (useOriginals) => set({ useOriginals }),
  zoom: 'fit',
  setZoom: (zoom) => set({ zoom }),
  safeZoneOverride: null,
  setSafeZoneOverride: (safeZoneOverride) => set({ safeZoneOverride })
}))

export function usePreviewSettings<T>(selector: (state: PreviewSettingsStore) => T): T {
  return useStore(previewSettingsStore, selector)
}
