// The left panels and the icon rail. Each panel's content is looked up in leftPanels.tsx; a panel
// with no entry there shows its empty state until the feature that fills it lands.
import {
  ArrowLeftRight,
  AudioLines,
  Captions,
  Download,
  Film,
  Sparkles,
  Type,
  type LucideIcon
} from 'lucide-react'
import type { LeftTool } from '@shared/layout'

export interface LeftToolDefinition {
  label: string
  icon: LucideIcon
  /** AI tools take the lavender accent. */
  ai: boolean
  emptyDescription: string
}

// The icon rail, top to bottom. Export is not on the rail: the top bar's Export button opens it.
export const RAIL_TOOLS: readonly LeftTool[] = [
  'media',
  'ai-clip-finder',
  'text',
  'audio',
  'transitions',
  'captions'
]

export const LEFT_TOOL_DEFINITIONS: Record<LeftTool, LeftToolDefinition> = {
  media: {
    label: 'Media',
    icon: Film,
    ai: false,
    emptyDescription: 'Import footage to start a project. Your media library will appear here.'
  },
  'ai-clip-finder': {
    label: 'Clip Finder',
    icon: Sparkles,
    ai: true,
    emptyDescription:
      'Find likely shorts in a long video. Suggestions appear here, marked in lavender.'
  },
  text: {
    label: 'Text',
    icon: Type,
    ai: false,
    emptyDescription: 'Text overlays for the selected short.'
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
  captions: {
    label: 'Captions',
    icon: Captions,
    ai: false,
    emptyDescription: 'Generate and style captions for the selected short.'
  },
  export: {
    label: 'Export',
    icon: Download,
    ai: false,
    emptyDescription: 'Choose resolution, format and quality, then render the short.'
  }
}
