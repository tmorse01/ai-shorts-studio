import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import { projectStore } from '@renderer/features/project/projectStore'
import { watchMediaJobs } from '@renderer/features/media/mediaJobToasts'
import {
  loadAnalysisJobs,
  watchAnalysisJobs,
  watchAnalysisRecords,
  watchPlaybackForAnalysis
} from '@renderer/features/analysis/analysisSync'
import {
  watchAnalysisResults,
  notifyAnalysisResult
} from '@renderer/features/analysis/analysisResults'
import { uiStore } from '@renderer/features/layout/useUiStore'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { watchBatches } from '@renderer/features/batch/batchSync'
import { importScriptDrafts } from '@renderer/features/scripts/importScriptDrafts'
import { reportAssemblyBatch } from '@renderer/features/assembly/assemblyQueueStore'
import { watchRenderQueue } from '@renderer/features/export/renderQueueSync'
import { renderQueueStore } from '@renderer/features/export/renderQueueStore'
import { watchSearchIndex } from '@renderer/features/search/searchSync'
import { refreshAiStatus, watchAi } from '@renderer/features/ai/aiSync'
import { toast } from '@renderer/features/toasts/toast'

import './theme/fonts'
import './theme/tokens.css'
import './theme/base.css'

// Closing or reloading the window writes pending changes first. The renderer cannot hold the close
// until the write finishes, so this is best effort.
window.addEventListener('beforeunload', () => void projectStore.getState().flush())

// Failed media jobs show as error toasts. Jobs keep running in main across reloads.
if (window.api) {
  watchMediaJobs(window.api, (input) => {
    toast.error(input)
  })
  // Analysis records come from main. Playback pauses analysis while the user is playing.
  watchAnalysisRecords(window.api)
  watchPlaybackForAnalysis(window.api, playbackStore)
  // Analysis progress comes from the job queue. A finished clip reports its counts in a toast.
  watchAnalysisJobs(window.api)
  void loadAnalysisJobs(window.api)
  watchAnalysisResults({
    api: window.api,
    nameOf: (folderPath, mediaId) => {
      const current = projectStore.getState().current
      if (current?.folderPath !== folderPath) return undefined
      return current.project.media.find((ref) => ref.id === mediaId)?.fileName
    },
    notify: notifyAnalysisResult,
    actions: {
      // Stub until #311 lands: the Generate shorts flow is not built yet.
      generateShorts: () => toast.info({ title: 'Generate shorts is coming soon.' }),
      openClipFinder: () => uiStore.getState().setLeftTool('ai-clip-finder')
    }
  })
  // Batches come from main. The open project keeps them current so its saves do not drop them.
  watchBatches(window.api, projectStore, importScriptDrafts, reportAssemblyBatch)
  // Exports come from main's render queue. The open project records each finished short as Exported.
  watchRenderQueue(window.api, projectStore)
  void renderQueueStore.getState().refresh()
  // The footage search index follows the open project and its analysis records.
  watchSearchIndex(window.api)
  // Cloud AI status comes from main. The cap toast fires when main reports the cap was reached.
  watchAi(window.api)
  void refreshAiStatus(window.api)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App devRoutes={import.meta.env.DEV} />
  </StrictMode>
)
