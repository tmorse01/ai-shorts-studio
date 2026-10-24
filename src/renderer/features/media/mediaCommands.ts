// Project-level command for importing media. The caller builds the refs (ids and paths), which keeps
// the command deterministic in tests. Imported refs start pending: no duration until the background
// probe reports one.
import type { MediaRef, Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

export function importMediaCommand(refs: readonly MediaRef[]): Command<Project> {
  return {
    label: refs.length === 1 ? 'Import 1 file' : `Import ${refs.length} files`,
    produce: (draft) => {
      draft.media.push(...refs)
    }
  }
}
