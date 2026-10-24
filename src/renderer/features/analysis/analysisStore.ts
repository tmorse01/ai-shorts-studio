// The analysis records of each open project, as main last reported them. Media cards read their
// status from here. Main is the owner; this store only mirrors what main sends.
import { createStore } from 'zustand'
import type { AnalysisFile } from '@shared/analysis/analysis'

export interface AnalysisState {
  filesByFolder: Record<string, AnalysisFile>
}

export interface AnalysisActions {
  setFile: (folderPath: string, file: AnalysisFile) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const analysisStore = createStore<AnalysisStore>()((set) => ({
  filesByFolder: {},
  setFile: (folderPath, file) =>
    set((state) => ({ filesByFolder: { ...state.filesByFolder, [folderPath]: file } }))
}))
