// Pure logic for Project home: the guided start steps, when they show, and which sidebar section is
// active while the page scrolls. Kept free of React so the rules can be tested directly.

export const PROJECT_SECTIONS = [
  { id: 'project-footage', label: 'Footage' },
  { id: 'project-shorts', label: 'Shorts' },
  { id: 'project-scripts', label: 'Scripts' }
] as const

export type ProjectSectionId = (typeof PROJECT_SECTIONS)[number]['id']

export interface GuideCounts {
  mediaCount: number
  momentCount: number
  shortCount: number
}

export type GuideStepId = 'import' | 'moments' | 'short'

export interface GuideStep {
  id: GuideStepId
  label: string
  description: string
  /** The step's work is already in the project. */
  done: boolean
  /** The step's button may be used. A step is enabled only once the step before it is done. */
  enabled: boolean
}

// The three guided steps, in order: footage, then moments (marked or AI suggested), then a short.
export function guideSteps(counts: GuideCounts): GuideStep[] {
  const imported = counts.mediaCount > 0
  const marked = counts.momentCount > 0
  return [
    {
      id: 'import',
      label: 'Import footage',
      description: 'Add the video, audio or image files this project will cut from.',
      done: imported,
      enabled: true
    },
    {
      id: 'moments',
      label: 'Mark moments or let AI suggest them',
      description: 'Analyse the footage, then keep the moments worth cutting.',
      done: marked,
      enabled: imported
    },
    {
      id: 'short',
      label: 'Make a short',
      description: 'Start a short from the moments you kept.',
      done: counts.shortCount > 0,
      enabled: marked
    }
  ]
}

// The guide stays until the project has footage and a short. After that the real sections are enough.
export function showGuide(counts: GuideCounts): boolean {
  return !(counts.mediaCount > 0 && counts.shortCount > 0)
}

export interface SectionTop {
  id: ProjectSectionId
  /** Distance of the section's top edge from the top of the scrolling page, in pixels. */
  top: number
}

// The last section whose top has reached the threshold line. Before the first section arrives, the
// first one stays active.
export function activeSection(tops: readonly SectionTop[], threshold = 48): ProjectSectionId {
  let active: ProjectSectionId = PROJECT_SECTIONS[0].id
  for (const section of tops) {
    if (section.top <= threshold) active = section.id
  }
  return active
}
