// Tells the user what an analysis found. When a clip finishes, a toast reports its counts with two
// buttons: Generate shorts and Open Clip Finder. Counts come from main's reads, so the rule stays here.
import type { StoreApi } from 'zustand'
import type { RendererInvokeApi, Unsubscribe } from '@shared/ipc'
import { toast, type ToastInput } from '../toasts/toast'
import { analysisStore, type AnalysisStore } from './analysisStore'
import { analysisSummaryText, newlyFinishedMedia, type AnalysisCounts } from './analysisProgress'

export interface AnalysisResultActions {
  /** Starts shorts from the clip. Stubbed until the Generate shorts flow lands. */
  generateShorts: (folderPath: string, mediaId: string) => void
  /** Brings up the Clip Finder for the editor. */
  openClipFinder: (folderPath: string, mediaId: string) => void
}

export interface AnalysisResultDeps {
  api: RendererInvokeApi
  /** The file name of a media item in an open project, or undefined when it is not known. */
  nameOf: (folderPath: string, mediaId: string) => string | undefined
  notify: (input: ToastInput) => void
  actions: AnalysisResultActions
}

/** Reads the counts the summary reports. A read that fails counts as zero rather than blocking the toast. */
export async function resultCounts(
  api: RendererInvokeApi,
  folderPath: string,
  mediaId: string,
  shots: number
): Promise<AnalysisCounts> {
  const [transcript, suggestions] = await Promise.all([
    api.invoke('analysis:transcript:read', { projectFolder: folderPath, mediaId }),
    api.invoke('analysis:suggestions:read', { projectFolder: folderPath, mediaId })
  ])
  return {
    transcriptLines:
      transcript.ok && transcript.data.transcript ? transcript.data.transcript.segments.length : 0,
    shots,
    tags: suggestions.ok ? suggestions.data.tags.length : 0,
    moments: suggestions.ok ? suggestions.data.moments.length : 0
  }
}

/** Shows the summary toast for each clip that just finished. Returns the function that stops watching. */
export function watchAnalysisResults(
  deps: AnalysisResultDeps,
  store: StoreApi<AnalysisStore> = analysisStore
): Unsubscribe {
  return store.subscribe((state, previous) => {
    for (const [folderPath, file] of Object.entries(state.filesByFolder)) {
      if (file === previous.filesByFolder[folderPath]) continue
      for (const mediaId of newlyFinishedMedia(previous.filesByFolder[folderPath], file)) {
        const record = file.records[mediaId]
        const shots = record?.shots?.length ?? 0
        const fileName = deps.nameOf(folderPath, mediaId) ?? 'footage'
        void resultCounts(deps.api, folderPath, mediaId, shots).then((counts) => {
          deps.notify({
            title: analysisSummaryText(fileName, counts),
            actions: [
              {
                label: 'Generate shorts',
                run: () => deps.actions.generateShorts(folderPath, mediaId)
              },
              {
                label: 'Open Clip Finder',
                run: () => deps.actions.openClipFinder(folderPath, mediaId)
              }
            ]
          })
        })
      }
    }
  })
}

/** The toast for a finished clip, using the app's toast service. */
export const notifyAnalysisResult = (input: ToastInput): void => {
  toast.success(input)
}
