// Project-level edits made from Project home. Each one is a Command<Project>, so it runs through the
// project history and can be undone.
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

export function renameProjectCommand(name: string): Command<Project> {
  return {
    label: 'Rename project',
    produce: (draft) => {
      const trimmed = name.trim()
      if (trimmed === '') throw new Error('A project needs a name.')
      draft.name = trimmed
    }
  }
}
