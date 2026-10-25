// Project-level command for batch drafts (#148). A batch draft is a short created when a batch footage plan
// was applied. Keeping it clears the flag, so the badge goes and the short is an ordinary short. Discard uses
// deleteShortCommand and Regenerate starts a new footage batch, so neither needs a command here.
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

export function keepBatchDraftCommand(shortId: string, now: string): Command<Project> {
  return {
    label: 'Keep draft short',
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === shortId)
      if (!short) throw new Error('This short no longer exists.')
      if (!short.batchDraft) throw new Error('This short is not a batch draft.')
      delete short.batchDraft
      short.updatedAt = now
    }
  }
}
