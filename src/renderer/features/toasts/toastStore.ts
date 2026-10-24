// The list of toasts on screen. Only the toast service writes to it; ToastHost reads it.
import { createStore } from 'zustand/vanilla'

export type ToastTone = 'info' | 'success' | 'ai' | 'error'

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** Technical detail for the Details dialog. Only error toasts carry one. */
  details?: string
  /** Milliseconds before the toast closes itself. null means it stays until the user dismisses it. */
  dismissAfterMs: number | null
}

export interface ToastState {
  toasts: ToastItem[]
}

export interface ToastStoreActions {
  add: (toast: ToastItem) => void
  remove: (id: string) => void
}

export type ToastStore = ToastState & ToastStoreActions

export const toastStore = createStore<ToastStore>()((set) => ({
  toasts: [],
  add: (toast) => set((state) => ({ toasts: [...state.toasts, toast] })),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
}))
