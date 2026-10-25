// Accepting AI suggestions as one project command. Accepting a tag adds it to the clip, creating the custom
// tag when it does not exist yet; accepting a moment saves it with createdBy 'ai'. Every suggestion accepted
// in one go is one command, so one undo takes all of them back. Pure, so the tests use the same rules as the
// panel. The ids are passed in, so a command is deterministic once built.
import type { MomentSuggestion } from '@shared/analysis/suggestions'
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'
import { findTagByName } from '../media/mediaTags'

export interface AcceptSuggestionsInput {
  mediaId: string
  /** Tag names to add to the clip. A name that matches an existing tag reuses it. */
  tags: readonly string[]
  moments: readonly MomentSuggestion[]
  /** Makes an id for each new tag and moment. */
  newId: () => string
}

export function acceptSuggestionsCommand(input: AcceptSuggestionsInput): Command<Project> {
  const count = input.tags.length + input.moments.length
  return {
    label: count === 1 ? 'Accept AI suggestion' : `Accept ${count} AI suggestions`,
    produce: (draft) => {
      const ref = draft.media.find((item) => item.id === input.mediaId)
      if (!ref) throw new Error('The clip is no longer in the project.')

      const tagIds: string[] = [...(ref.tagIds ?? [])]
      for (const name of input.tags) {
        const existing = findTagByName(draft, name)
        if (existing) {
          if (!tagIds.includes(existing.id)) tagIds.push(existing.id)
          continue
        }
        const id = input.newId()
        const trimmed = name.trim()
        draft.mediaTags.push({ id, name: trimmed })
        tagIds.push(id)
      }
      if (tagIds.length > (ref.tagIds ?? []).length) ref.tagIds = tagIds

      for (const moment of input.moments) {
        const saved = draft.moments.some(
          (item) =>
            item.mediaId === input.mediaId &&
            item.inMs === moment.inMs &&
            item.outMs === moment.outMs
        )
        if (saved) continue
        if (moment.outMs <= moment.inMs)
          throw new Error('A moment needs an Out point after its In point.')
        draft.moments.push({
          id: input.newId(),
          mediaId: input.mediaId,
          name: moment.name,
          inMs: moment.inMs,
          outMs: moment.outMs,
          tags: [],
          createdBy: 'ai',
          ...(moment.note ? { note: moment.note } : {})
        })
      }
    }
  }
}
