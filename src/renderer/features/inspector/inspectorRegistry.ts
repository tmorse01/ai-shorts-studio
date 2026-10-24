// The inspector's section registry. Each feature adds its sections here (Epics 10 to 13). A section
// shows for the selection types it lists, under the tab it names. Until a feature registers one, a
// tab shows an empty state.
import { ClipAudioSection } from '@renderer/features/audio/ClipAudioSection'
import { VideoClipSection } from '@renderer/features/clip/VideoClipSection'
import { ShortPropertiesSection } from '@renderer/features/shorts/ShortPropertiesSection'
import type { InspectorSectionDef } from './inspectorModel'

export const INSPECTOR_SECTIONS: readonly InspectorSectionDef[] = [
  {
    id: 'short-properties',
    title: 'Short properties',
    tab: 'video',
    order: 10,
    selections: ['short'],
    Component: ShortPropertiesSection
  },
  {
    id: 'video-clip',
    title: 'Video clip',
    tab: 'video',
    order: 10,
    selections: ['video-clip'],
    Component: VideoClipSection
  },
  {
    id: 'clip-audio',
    title: 'Clip audio',
    tab: 'audio',
    order: 10,
    selections: ['audio-clip', 'video-clip'],
    Component: ClipAudioSection
  }
]
