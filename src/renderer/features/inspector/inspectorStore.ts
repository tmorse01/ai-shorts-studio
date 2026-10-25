// The inspector's state: the current selection type, the open tab and each section's collapsed
// state. Components read it through selectors. Collapsed state is per section id, so a section keeps
// its state whenever its selection type is shown again.
import { createStore } from 'zustand'
import type { ClipAudioChange } from '@shared/timeline/edits'
import type { DuckingSettings } from '@shared/timeline/ducking'
import type { ClipFraming } from '@shared/timeline/framing'
import type { Clip, Timeline, Transition, TransitionKind } from '@shared/timeline/timeline'
import type { TextItem } from '@shared/text/textItem'
import type { ImageItem } from '@shared/image/imageItem'
import type { SoundValues } from '@renderer/features/audio/soundValues'
import { defaultTabFor, type InspectorTab, type SelectionType } from './inspectorModel'
import type { SharedProperties } from './sharedProperties'

// The sound of the selection, for the sound fields (Epic 07, #91; multi-select #99). The timeline pane
// publishes it when every selected item has a sound. shared holds each sound property's value, mixed
// when the items differ. apply runs one edit on every sound as one history entry; calls with the same
// mergeKey fold into one entry, so a volume drag is one undo step.
export interface AudioTarget {
  soundIds: readonly string[]
  shared: SharedProperties<SoundValues>
  apply: (label: string, change: ClipAudioChange, mergeKey?: string) => void
}

// The selected clip on the Music lane, for the music section (Epic 12, #125). The timeline pane publishes
// it. The ducking settings belong to the short, so applyDucking edits the short; each call with the same
// mergeKey folds into one history entry. loopToFill repeats the clip to the short's length.
export interface MusicTarget {
  ducking: DuckingSettings
  // False when the clip already reaches the end of the short, so there is nothing to loop.
  canLoop: boolean
  applyDucking: (label: string, change: Partial<DuckingSettings>, mergeKey?: string) => void
  loopToFill: () => void
}

// The one selected video clip, for the video clip section (Epic 08, #96). The timeline pane publishes
// it. apply runs an edit as one history entry; calls with the same mergeKey fold into one entry. Its
// sound is published separately as the audio target.
export interface VideoClipTarget {
  clip: Clip
  apply: (label: string, edit: (timeline: Timeline) => Timeline, mergeKey?: string) => void
}

// The framing of the one selected video clip, for the framing section (Epic 09, #105 and #106). framing
// is the stored framing, or a centred fill. apply runs an edit on that clip as one history entry; calls
// with the same mergeKey fold into one entry, so a slider drag is one undo step.
export interface FramingTarget {
  clipId: string
  framing: ClipFraming
  apply: (label: string, edit: (framing: ClipFraming) => ClipFraming, mergeKey?: string) => void
}

// The one selected text overlay, for the text section (Epic 13, #127). The timeline pane publishes it. item is
// the stored item. apply runs an edit on it as one history entry; calls with the same mergeKey fold into one
// entry, so typing or a slider drag is one undo step.
export interface TextClipTarget {
  clip: Clip
  item: TextItem
  apply: (label: string, edit: (item: TextItem) => TextItem, mergeKey?: string) => void
}

// The one selected image overlay, for the image section (Epic 13, #129). The timeline pane publishes it. item
// is the stored item. apply runs an edit on it as one history entry, and calls with the same mergeKey fold
// into one entry.
export interface ImageClipTarget {
  clip: Clip
  item: ImageItem
  apply: (label: string, edit: (item: ImageItem) => ImageItem, mergeKey?: string) => void
}

// The one selected transition, for the transition section (Epic 08, #98). The timeline pane publishes
// it. limitMs is the longest length the handles on its cut allow. Each change is one history entry, and
// calls with the same mergeKey fold into one entry.
export interface TransitionTarget {
  transition: Transition
  limitMs: number
  setKind: (kind: TransitionKind) => void
  setDuration: (ms: number, mergeKey?: string) => void
  remove: () => void
}

export interface InspectorState {
  selectionType: SelectionType
  // How many timeline items the selection holds. Shown in the selection header.
  selectionCount: number
  tab: InspectorTab
  collapsed: Record<string, boolean>
  audioTarget: AudioTarget | null
  musicTarget: MusicTarget | null
  videoTarget: VideoClipTarget | null
  framingTarget: FramingTarget | null
  transitionTarget: TransitionTarget | null
  textTarget: TextClipTarget | null
  imageTarget: ImageClipTarget | null
}

export interface InspectorActions {
  // Changing the selection type moves the tab to the one it opens. The same type keeps the tab.
  // count is the number of selected items (defaults to 1). The short has no selection and ignores it.
  setSelectionType: (selectionType: SelectionType, count?: number) => void
  setTab: (tab: InspectorTab) => void
  toggleSection: (sectionId: string) => void
  setAudioTarget: (target: AudioTarget | null) => void
  setMusicTarget: (target: MusicTarget | null) => void
  setVideoTarget: (target: VideoClipTarget | null) => void
  setFramingTarget: (target: FramingTarget | null) => void
  setTransitionTarget: (target: TransitionTarget | null) => void
  setTextTarget: (target: TextClipTarget | null) => void
  setImageTarget: (target: ImageClipTarget | null) => void
}

export type InspectorStore = InspectorState & InspectorActions

export function createInspectorStore() {
  return createStore<InspectorStore>()((set, get) => ({
    selectionType: 'short',
    selectionCount: 0,
    tab: defaultTabFor('short'),
    collapsed: {},
    audioTarget: null,
    musicTarget: null,
    videoTarget: null,
    framingTarget: null,
    transitionTarget: null,
    textTarget: null,
    imageTarget: null,
    setImageTarget: (imageTarget) => set({ imageTarget }),
    setTextTarget: (textTarget) => set({ textTarget }),
    setTransitionTarget: (transitionTarget) => set({ transitionTarget }),
    setAudioTarget: (audioTarget) => set({ audioTarget }),
    setMusicTarget: (musicTarget) => set({ musicTarget }),
    setVideoTarget: (videoTarget) => set({ videoTarget }),
    setFramingTarget: (framingTarget) => set({ framingTarget }),
    setSelectionType: (selectionType, count = 1) => {
      const current = get()
      if (selectionType === current.selectionType) {
        if (count !== current.selectionCount) set({ selectionCount: count })
        return
      }
      set({ selectionType, selectionCount: count, tab: defaultTabFor(selectionType) })
    },
    setTab: (tab) => set({ tab }),
    toggleSection: (sectionId) =>
      set((state) => ({
        collapsed: { ...state.collapsed, [sectionId]: !state.collapsed[sectionId] }
      }))
  }))
}

export const inspectorStore = createInspectorStore()
