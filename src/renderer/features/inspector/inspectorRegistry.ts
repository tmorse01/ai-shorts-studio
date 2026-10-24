// The inspector's section registry. Each feature adds its sections here (Epics 10 to 13). A section
// shows for the selection types it lists, under the tab it names. Until a feature registers one, a
// tab shows an empty state.
import { ClipAudioSection } from '@renderer/features/audio/ClipAudioSection'
import { TranscriptSection } from '@renderer/features/transcript/TranscriptSection'
import { SELECTION_TYPES, type InspectorSectionDef } from './inspectorModel'

export const INSPECTOR_SECTIONS: readonly InspectorSectionDef[] = [
  {
    id: 'clip-audio',
    title: 'Clip audio',
    tab: 'audio',
    order: 10,
    selections: ['audio-clip', 'video-clip'],
    Component: ClipAudioSection
  },
  {
    // Source view shows the open clip, whatever the timeline selection is, so every type lists it.
    id: 'transcript',
    title: 'Transcript',
    tab: 'transcript',
    order: 10,
    selections: SELECTION_TYPES,
    Component: TranscriptSection
  }
]
