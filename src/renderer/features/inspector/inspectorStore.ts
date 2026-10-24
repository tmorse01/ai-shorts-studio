// The inspector's state: the current selection type, the open tab and each section's collapsed
// state. Components read it through selectors. Collapsed state is per section id, so a section keeps
// its state whenever its selection type is shown again.
import { createStore } from 'zustand'
import type { ClipAudioChange } from '@shared/timeline/edits'
import type { DuckingSettings } from '@shared/timeline/ducking'
import type { ClipFraming } from '@shared/timeline/framing'
import type { Clip, Timeline } from '@shared/timeline/timeline'
import { defaultTabFor, type InspectorTab, type SelectionType } from './inspectorModel'

// The sound of the one selected clip, for the clip audio section (Epic 07, #91). The timeline pane
// publishes it. apply runs an edit on that clip as one history entry; calls with the same mergeKey fold
// into one entry, so a volume drag is one undo step.
export interface AudioTarget {
  clipId: string
  muted: boolean
  gain: number
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
// it. apply runs an edit as one history entry; calls with the same mergeKey fold into one entry. The
// linked audio is the clip's sound when it has one, or null when the sound is detached.
export interface VideoClipTarget {
  clip: Clip
  linkedAudio: Clip | null
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

export interface InspectorState {
  selectionType: SelectionType
  tab: InspectorTab
  collapsed: Record<string, boolean>
  audioTarget: AudioTarget | null
  musicTarget: MusicTarget | null
  videoTarget: VideoClipTarget | null
  framingTarget: FramingTarget | null
}

export interface InspectorActions {
  // Changing the selection type moves the tab to the one it opens. The same type keeps the tab.
  setSelectionType: (selectionType: SelectionType) => void
  setTab: (tab: InspectorTab) => void
  toggleSection: (sectionId: string) => void
  setAudioTarget: (target: AudioTarget | null) => void
  setMusicTarget: (target: MusicTarget | null) => void
  setVideoTarget: (target: VideoClipTarget | null) => void
  setFramingTarget: (target: FramingTarget | null) => void
}

export type InspectorStore = InspectorState & InspectorActions

export function createInspectorStore() {
  return createStore<InspectorStore>()((set, get) => ({
    selectionType: 'short',
    tab: defaultTabFor('short'),
    collapsed: {},
    audioTarget: null,
    musicTarget: null,
    videoTarget: null,
    framingTarget: null,
    setAudioTarget: (audioTarget) => set({ audioTarget }),
    setMusicTarget: (musicTarget) => set({ musicTarget }),
    setVideoTarget: (videoTarget) => set({ videoTarget }),
    setFramingTarget: (framingTarget) => set({ framingTarget }),
    setSelectionType: (selectionType) => {
      if (selectionType === get().selectionType) return
      set({ selectionType, tab: defaultTabFor(selectionType) })
    },
    setTab: (tab) => set({ tab }),
    toggleSection: (sectionId) =>
      set((state) => ({
        collapsed: { ...state.collapsed, [sectionId]: !state.collapsed[sectionId] }
      }))
  }))
}

export const inspectorStore = createInspectorStore()
