// The cloud AI status as main last reported it: settings, whether a key is saved, and this month's
// usage. Main is the owner. This store only mirrors what main sends, and never holds the key.
import { createStore } from 'zustand'
import type { AiStatus } from '@shared/ai/aiSettings'

export interface AiState {
  status: AiStatus | null
}

export interface AiActions {
  setStatus: (status: AiStatus) => void
}

export type AiStore = AiState & AiActions

export const aiStore = createStore<AiStore>()((set) => ({
  status: null,
  setStatus: (status) => set({ status })
}))
