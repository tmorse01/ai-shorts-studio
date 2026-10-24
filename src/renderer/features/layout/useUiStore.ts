import { useStore } from 'zustand'
import { createUiStore, type UiStore } from './uiStore'

// The app-wide UI store. Components read it through selectors, never the whole store.
export const uiStore = createUiStore()

export function useUiStore<T>(selector: (state: UiStore) => T): T {
  return useStore(uiStore, selector)
}
