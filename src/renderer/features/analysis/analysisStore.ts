// The analysis records of each open project, as main last reported them. Media cards read their
// status from here. Main is the owner; this store only mirrors what main sends.
import { createStore } from 'zustand'
import type { AnalysisFile } from '@shared/analysis/analysis'
import { isJobFinished, type JobSnapshot } from '@shared/media/jobs'

export interface AnalysisState {
  filesByFolder: Record<string, AnalysisFile>
  /** Analysis jobs that have not finished, by job id. Other kinds of job are not kept here. */
  jobs: Record<string, JobSnapshot>
}

export interface AnalysisActions {
  setFile: (folderPath: string, file: AnalysisFile) => void
  setJob: (job: JobSnapshot) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

// Main is the owner of the records and the jobs. This store mirrors both, so cards and the Analysis
// panel can show progress.
export const analysisStore = createStore<AnalysisStore>()((set) => ({
  filesByFolder: {},
  jobs: {},
  setFile: (folderPath, file) =>
    set((state) => ({ filesByFolder: { ...state.filesByFolder, [folderPath]: file } })),
  setJob: (job) =>
    set((state) => {
      if (job.kind !== 'analysis') return state
      const jobs = { ...state.jobs }
      if (isJobFinished(job.status)) delete jobs[job.id]
      else jobs[job.id] = job
      return { jobs }
    })
}))
