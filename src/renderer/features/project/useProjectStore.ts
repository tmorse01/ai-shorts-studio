import { useStore } from 'zustand'
import { projectStore, type ProjectStore } from './projectStore'

// Reads the default project store through a selector, so a component renders only what it uses.
export function useProjectStore<T>(selector: (state: ProjectStore) => T): T {
  return useStore(projectStore, selector)
}
