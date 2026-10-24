// Talks to main about analysis: starting it after import or project open, the project toggle, the
// per-clip re-analyze action, pausing while playback runs, and applying the records main reports.
// Every call takes the api as a parameter, so the logic can be tested with a fake.
import type { StoreApi } from 'zustand'
import type { AnalysisFile } from '@shared/analysis/analysis'
import type { IpcResult, RendererApi, RendererInvokeApi, Unsubscribe } from '@shared/ipc'
import type { MediaRef } from '@shared/project/schema'
import { toast } from '../toasts/toast'
import { analysisStore } from './analysisStore'

// Media paths as main needs them. Relative refs resolve against the project folder.
function analysisItems(folderPath: string, media: readonly MediaRef[]) {
  return media.map((ref) => ({
    id: ref.id,
    path: ref.pathKind === 'absolute' ? ref.path : `${folderPath}/${ref.path}`
  }))
}

function applyResult(
  folderPath: string,
  result: IpcResult<{ file: AnalysisFile }>,
  title: string
): void {
  if (result.ok) {
    analysisStore.getState().setFile(folderPath, result.data.file)
    return
  }
  toast.error({ title, description: result.error.message, details: result.error.details })
}

/** Makes sure every item has a record, and starts pending stages when the project analyzes automatically. */
export async function syncAnalysis(
  api: RendererInvokeApi,
  folderPath: string,
  media: readonly MediaRef[]
): Promise<void> {
  const result = await api.invoke('analysis:sync', {
    projectFolder: folderPath,
    items: analysisItems(folderPath, media)
  })
  applyResult(folderPath, result, 'Could not analyze the footage')
}

export async function setAnalyzeAutomatically(
  api: RendererInvokeApi,
  folderPath: string,
  enabled: boolean,
  media: readonly MediaRef[]
): Promise<void> {
  const result = await api.invoke('analysis:setAuto', {
    projectFolder: folderPath,
    enabled,
    items: analysisItems(folderPath, media)
  })
  applyResult(folderPath, result, 'Could not change the analysis setting')
}

export async function reanalyzeMedia(
  api: RendererInvokeApi,
  folderPath: string,
  ref: MediaRef
): Promise<void> {
  const [item] = analysisItems(folderPath, [ref])
  const result = await api.invoke('analysis:reanalyze', { projectFolder: folderPath, item })
  applyResult(folderPath, result, 'Could not re-analyze the clip')
}

/** Applies the records main pushes after every change. */
export function watchAnalysisRecords(api: Pick<RendererApi, 'on'>): Unsubscribe {
  return api.on('analysis:changed', ({ projectFolder, file }) => {
    analysisStore.getState().setFile(projectFolder, file)
  })
}

/** Tells main when playback starts or stops, so analysis pauses while the user is playing. */
export function watchPlaybackForAnalysis(
  api: RendererInvokeApi,
  store: StoreApi<{ playing: boolean }>
): Unsubscribe {
  return store.subscribe((state, previous) => {
    if (state.playing === previous.playing) return
    void api.invoke('analysis:playback', { playing: state.playing })
  })
}
