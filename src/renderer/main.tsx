import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import { projectStore } from '@renderer/features/project/projectStore'
import { watchMediaJobs } from '@renderer/features/media/mediaJobToasts'
import {
  watchAnalysisRecords,
  watchPlaybackForAnalysis
} from '@renderer/features/analysis/analysisSync'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { watchBatches } from '@renderer/features/batch/batchSync'
import { importScriptDrafts } from '@renderer/features/scripts/importScriptDrafts'
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
  // Batches come from main. The open project keeps them current so its saves do not drop them.
  watchBatches(window.api, projectStore, importScriptDrafts)
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
