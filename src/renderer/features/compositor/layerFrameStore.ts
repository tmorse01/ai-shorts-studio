// The frame the preview last drew, with each layer's real placement (its size comes from the decoded
// footage). The canvas gizmo reads it to draw the selection box and to hit-test pointers, so both
// match what is on screen. Written by the preview renderer after each draw.
import { createStore } from 'zustand/vanilla'
import type { FrameDescription } from '@shared/compositor/frame'

export interface LayerFrameState {
  frame: FrameDescription | null
  setFrame: (frame: FrameDescription) => void
}

export const layerFrameStore = createStore<LayerFrameState>()((set) => ({
  frame: null,
  setFrame: (frame) => set({ frame })
}))
