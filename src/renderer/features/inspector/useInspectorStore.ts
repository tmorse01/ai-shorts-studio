import { useStore } from 'zustand'
import { inspectorStore, type InspectorStore } from './inspectorStore'

// Components read the inspector store through selectors, never the whole store.
export function useInspectorStore<T>(selector: (state: InspectorStore) => T): T {
  return useStore(inspectorStore, selector)
}
