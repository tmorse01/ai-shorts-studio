import type { JSX } from 'react'
import type { LeftTool } from '@shared/layout'
import { MediaPanel } from '@renderer/features/media/MediaPanel'
import { TextPanel } from '@renderer/features/text/TextPanel'
import { CaptionsPanel } from '@renderer/features/captions/CaptionsPanel'
import { ClipFinderPanel } from '@renderer/features/clipFinder/ClipFinderPanel'
import { ExportPanel } from '@renderer/features/export/ExportPanel'
import { AudioPanel } from '@renderer/features/audio/AudioPanel'
import { TransitionPanel } from '@renderer/features/transition/TransitionPanel'

// What a panel may read from the editor. The short is open in the editor, so shortId is set there.
export interface LeftPanelProps {
  shortId?: string
}

// Panel registry: a left tool's content. Later epics add their panel here. A tool without an entry
// shows its empty state.
export const LEFT_PANELS: Partial<Record<LeftTool, (props: LeftPanelProps) => JSX.Element>> = {
  media: () => <MediaPanel />,
  'ai-clip-finder': () => <ClipFinderPanel />,
  text: (props) => <TextPanel shortId={props.shortId} />,
  audio: (props) => <AudioPanel shortId={props.shortId} />,
  transitions: (props) => <TransitionPanel shortId={props.shortId} />,
  captions: () => <CaptionsPanel />,
  export: () => <ExportPanel />
}
