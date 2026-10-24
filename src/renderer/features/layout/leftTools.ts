// The left icon rail's tools, in rail order. Each tool's panel shows its empty state until the
// feature that fills it lands.
import {
  ArrowLeftRight,
  AudioLines,
  Captions,
  Download,
  Film,
  Sparkles,
  Wand2,
  type LucideIcon
} from 'lucide-react'
import { LEFT_TOOLS, type LeftTool } from '@shared/layout'

export interface LeftToolDefinition {
  label: string
  icon: LucideIcon
  /** AI tools take the lavender accent. */
  ai: boolean
  emptyDescription: string
}

export const LEFT_TOOL_ORDER = LEFT_TOOLS

export const LEFT_TOOL_DEFINITIONS: Record<LeftTool, LeftToolDefinition> = {
  media: {
    label: 'Media',
    icon: Film,
    ai: false,
    emptyDescription: 'Import footage to start a project. Your media library will appear here.'
  },
  'ai-clip-finder': {
    label: 'AI Clip Finder',
    icon: Sparkles,
    ai: true,
    emptyDescription:
      'Find likely shorts in a long video. Suggestions appear here, marked in lavender.'
  },
  captions: {
    label: 'Captions',
    icon: Captions,
    ai: false,
    emptyDescription: 'Generate and style captions for the selected short.'
  },
  audio: {
    label: 'Audio',
    icon: AudioLines,
    ai: false,
    emptyDescription: 'Music and sound for this short.'
  },
  transitions: {
    label: 'Transitions',
    icon: ArrowLeftRight,
    ai: false,
    emptyDescription: 'Transitions between clips appear here.'
  },
  effects: {
    label: 'Effects',
    icon: Wand2,
    ai: false,
    emptyDescription: 'Visual effects and filters for the selected clip.'
  },
  export: {
    label: 'Export',
    icon: Download,
    ai: false,
    emptyDescription: 'Choose resolution, format and quality, then render the short.'
  }
}
