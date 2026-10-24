// Project-level commands for saved moments: save, rename, delete and retag. Each is a Command<Project>,
// so it runs through the project history and can be undone. Pure, so the tests use the same rules as
// the panel.
import type { Moment, Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

export function addMomentCommand(moment: Moment): Command<Project> {
  return {
    label: `Save moment ${moment.name}`,
    produce: (draft) => {
      if (!draft.media.some((ref) => ref.id === moment.mediaId)) {
        throw new Error('The source clip is no longer in the project.')
      }
      if (moment.outMs <= moment.inMs) {
        throw new Error('A moment needs an Out point after its In point.')
      }
      if (draft.moments.some((existing) => existing.id === moment.id)) {
        throw new Error('This moment is already saved.')
      }
      draft.moments.push({ ...moment, tags: [...moment.tags] })
    }
  }
}

export function renameMomentCommand(id: string, name: string): Command<Project> {
  const trimmed = name.trim()
  return {
    label: 'Rename moment',
    produce: (draft) => {
      if (trimmed === '') throw new Error('A moment needs a name.')
      const moment = draft.moments.find((item) => item.id === id)
      if (!moment) throw new Error('This moment no longer exists.')
      moment.name = trimmed
    }
  }
}

export function deleteMomentCommand(id: string): Command<Project> {
  return {
    label: 'Delete moment',
    produce: (draft) => {
      const index = draft.moments.findIndex((item) => item.id === id)
      if (index === -1) throw new Error('This moment no longer exists.')
      draft.moments.splice(index, 1)
    }
  }
}

// Replaces the tag ids of one moment. Duplicates are dropped and the order given is kept.
export function retagMomentCommand(id: string, tagIds: readonly string[]): Command<Project> {
  return {
    label: 'Tag moment',
    produce: (draft) => {
      const moment = draft.moments.find((item) => item.id === id)
      if (!moment) throw new Error('This moment no longer exists.')
      moment.tags = [...new Set(tagIds)]
    }
  }
}
