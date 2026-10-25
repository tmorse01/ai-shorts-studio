// The inspector's section registry. Each feature adds its sections here (Epics 10 to 13). A section
// shows for the selection types it lists, under the tab it names. Until a feature registers one, a
// tab shows an empty state.
import { ClipAudioSection } from '@renderer/features/audio/ClipAudioSection'
import { MusicSection } from '@renderer/features/music/MusicSection'
import { VideoClipSection } from '@renderer/features/clip/VideoClipSection'
import { ShortPropertiesSection } from '@renderer/features/shorts/ShortPropertiesSection'
import { TranscriptSection } from '@renderer/features/transcript/TranscriptSection'
import { FramingSection } from '@renderer/features/framing/FramingSection'
import { TransitionSection } from '@renderer/features/transition/TransitionSection'
import { TextSection } from '@renderer/features/text/TextSection'
import { ImageSection } from '@renderer/features/image/ImageSection'
import { CaptionStyleSection } from '@renderer/features/captions/CaptionStyleSection'
import { ClipTakesSection } from '@renderer/features/takes/ClipTakesSection'
import { SELECTION_TYPES, type InspectorSectionDef } from './inspectorModel'

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
    selections: ['audio-clip'],
    Component: ClipAudioSection
  },
  {
    id: 'music',
    title: 'Music',
    tab: 'audio',
    order: 20,
    selections: ['audio-clip'],
    Component: MusicSection
  },
  {
    // Source view shows the open clip, whatever the timeline selection is, so every type lists it.
    id: 'transcript',
    title: 'Transcript',
    tab: 'transcript',
    order: 10,
    selections: SELECTION_TYPES,
    Component: TranscriptSection
  },
  {
    id: 'clip-framing',
    title: 'Framing',
    tab: 'video',
    order: 10,
    selections: ['video-clip'],
    Component: FramingSection
  },
  {
    id: 'clip-takes',
    title: 'Takes',
    tab: 'video',
    order: 30,
    selections: ['video-clip'],
    Component: ClipTakesSection
  },
  {
    id: 'text',
    title: 'Text',
    tab: 'video',
    order: 10,
    selections: ['text-clip'],
    Component: TextSection
  },
  {
    id: 'image',
    title: 'Image',
    tab: 'video',
    order: 10,
    selections: ['image-clip'],
    Component: ImageSection
  },
  {
    // The short's caption style: preset picker, and the fields of the preset it uses (Epic 11, #121).
    id: 'caption-style',
    title: 'Captions',
    tab: 'video',
    order: 30,
    selections: ['short'],
    Component: CaptionStyleSection
  },
  {
    id: 'transition',
    title: 'Transition',
    tab: 'video',
    order: 20,
    selections: ['transition'],
    Component: TransitionSection
  }
]
