import type { JSX } from 'react'
import type { LeftTool } from '@shared/layout'
import { MediaPanel } from '@renderer/features/media/MediaPanel'

// Panel registry: a left tool's content. Later epics add their panel here. A tool without an entry
// shows its empty state.
export const LEFT_PANELS: Partial<Record<LeftTool, () => JSX.Element>> = {
  media: () => <MediaPanel />
}
