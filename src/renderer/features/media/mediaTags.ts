// Tags for footage: the two built-in quick tags, custom tags, and the commands that change them. Each
// edit is a Command<Project>, so it runs through the project history and can be undone. Pure, so the
// tests use the same rules as the panel.
import type { MediaRef, MediaTag, Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

// Quick tags every project has. They cannot be renamed or deleted.
export const BUILT_IN_TAGS: readonly MediaTag[] = [
  { id: 'a-roll', name: 'A-roll' },
  { id: 'b-roll', name: 'B-roll' }
]

// Built-in tags first, then custom tags in the order they were made.
export function allMediaTags(project: Pick<Project, 'mediaTags'>): MediaTag[] {
  return [...BUILT_IN_TAGS, ...project.mediaTags]
}

export function findMediaTag(
  project: Pick<Project, 'mediaTags'>,
  id: string
): MediaTag | undefined {
  return allMediaTags(project).find((tag) => tag.id === id)
}

// The tags on one file, in tag-list order. Ids that no longer exist are skipped.
export function tagsOfMedia(ref: MediaRef, project: Pick<Project, 'mediaTags'>): MediaTag[] {
  const ids = ref.tagIds ?? []
  return allMediaTags(project).filter((tag) => ids.includes(tag.id))
}

// Whether a name is already a tag, ignoring case and spaces. `exceptId` lets a tag keep its own name.
export function isTagNameTaken(
  project: Pick<Project, 'mediaTags'>,
  name: string,
  exceptId?: string
): boolean {
  const wanted = normaliseName(name)
  return allMediaTags(project).some(
    (tag) => tag.id !== exceptId && normaliseName(tag.name) === wanted
  )
}

// How many of the selected files carry a tag: all, some or none. The panel uses it to show a tag as
// on or partly on, and a click on it adds or removes the tag from the whole selection.
export type TagCoverage = 'all' | 'some' | 'none'

export function tagCoverage(
  media: readonly MediaRef[],
  selectedIds: readonly string[],
  tagId: string
): TagCoverage {
  const selected = media.filter((ref) => selectedIds.includes(ref.id))
  const count = selected.filter((ref) => (ref.tagIds ?? []).includes(tagId)).length
  if (count === 0) return 'none'
  return count === selected.length ? 'all' : 'some'
}

export function createTagCommand(id: string, name: string): Command<Project> {
  const trimmed = name.trim()
  return {
    label: `Create tag ${trimmed}`,
    produce: (draft) => {
      if (trimmed === '') throw new Error('A tag needs a name.')
      if (isTagNameTaken(draft, trimmed))
        throw new Error(`A tag named "${trimmed}" already exists.`)
      draft.mediaTags.push({ id, name: trimmed })
    }
  }
}

export function renameTagCommand(id: string, name: string): Command<Project> {
  const trimmed = name.trim()
  return {
    label: `Rename tag to ${trimmed}`,
    produce: (draft) => {
      if (isBuiltInId(id)) throw new Error('Quick tags cannot be renamed.')
      const tag = draft.mediaTags.find((item) => item.id === id)
      if (!tag) throw new Error('That tag no longer exists.')
      if (trimmed === '') throw new Error('A tag needs a name.')
      if (isTagNameTaken(draft, trimmed, id)) {
        throw new Error(`A tag named "${trimmed}" already exists.`)
      }
      tag.name = trimmed
    }
  }
}

// Removes a custom tag from the project and from every file that carries it.
export function deleteTagCommand(id: string): Command<Project> {
  return {
    label: 'Delete tag',
    produce: (draft) => {
      if (isBuiltInId(id)) throw new Error('Quick tags cannot be deleted.')
      const index = draft.mediaTags.findIndex((item) => item.id === id)
      if (index === -1) throw new Error('That tag no longer exists.')
      draft.mediaTags.splice(index, 1)
      for (const ref of draft.media) {
        if (ref.tagIds?.includes(id)) ref.tagIds = ref.tagIds.filter((tagId) => tagId !== id)
      }
    }
  }
}

// Adds (`on` true) or removes (`on` false) one tag on each of the given files in one step.
export function setMediaTagCommand(
  mediaIds: readonly string[],
  tagId: string,
  on: boolean
): Command<Project> {
  const count = mediaIds.length
  return {
    label: on
      ? `Tag ${count} ${count === 1 ? 'file' : 'files'}`
      : `Untag ${count} ${count === 1 ? 'file' : 'files'}`,
    produce: (draft) => {
      for (const ref of draft.media) {
        if (!mediaIds.includes(ref.id)) continue
        const current = ref.tagIds ?? []
        if (on && !current.includes(tagId)) ref.tagIds = [...current, tagId]
        if (!on && current.includes(tagId)) ref.tagIds = current.filter((item) => item !== tagId)
      }
    }
  }
}

function isBuiltInId(id: string): boolean {
  return BUILT_IN_TAGS.some((tag) => tag.id === id)
}

function normaliseName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}
