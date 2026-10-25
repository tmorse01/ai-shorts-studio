import type { JSX } from 'react'
import type { LeftTool } from '@shared/layout'
import { MediaPanel } from '@renderer/features/media/MediaPanel'
import { CaptionsPanel } from '@renderer/features/captions/CaptionsPanel'
import { ExportPanel } from '@renderer/features/export/ExportPanel'

// Panel registry: a left tool's content. Later epics add their panel here. A tool without an entry
// shows its empty state.
export const LEFT_PANELS: Partial<Record<LeftTool, () => JSX.Element>> = {
  media: () => <MediaPanel />,
  captions: () => <CaptionsPanel />,
  export: () => <ExportPanel />
}
