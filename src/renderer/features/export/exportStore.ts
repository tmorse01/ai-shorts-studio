// The shared export settings and the startup encoder, for the export panel. Settings are saved through
// main as soon as they change. The encoder is detected in the background at startup, so it is polled
// for a short while if the panel opens before detection ends.
import { createStore } from 'zustand'
import {
  DEFAULT_EXPORT_SETTINGS,
  type EncoderInfo,
  type ExportSettings
} from '@shared/export/exportSettings'
import { toast } from '../toasts/toast'

const ENCODER_POLLS = 10
const ENCODER_POLL_MS = 500

export interface ExportStore {
  encoder: EncoderInfo | null
  settings: ExportSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<ExportSettings>) => void
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const exportStore = createStore<ExportStore>()((set, get) => ({
  encoder: null,
  settings: DEFAULT_EXPORT_SETTINGS,
  loaded: false,
  load: async () => {
    for (let attempt = 0; attempt < ENCODER_POLLS; attempt++) {
      const result = await window.api.invoke('export:state:get', {})
      if (!result.ok) {
        toast.error({
          title: 'Could not read the export settings',
          description: result.error.message,
          details: result.error.details
        })
        return
      }
      set({
        encoder: result.data.encoder,
        settings: result.data.settings ?? DEFAULT_EXPORT_SETTINGS,
        loaded: true
      })
      if (result.data.encoder) return
      await wait(ENCODER_POLL_MS)
    }
  },
  update: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void window.api.invoke('export:settings:save', { settings }).then((result) => {
      if (!result.ok) {
        toast.error({
          title: 'Could not save the export settings',
          description: result.error.message,
          details: result.error.details
        })
      }
    })
  }
}))
