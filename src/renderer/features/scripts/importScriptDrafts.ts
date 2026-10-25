// Adds the drafts of a finished script batch to the open project's Scripts, as one undoable command (#145).
// Drafts for a project that is not open are dropped, since they belong to that project's batch.
import type { GeneratedScript } from '@shared/ai/scriptGeneration'
import { projectStore } from '../project/projectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { toast } from '../toasts/toast'
import { createScriptsCommand } from './scriptCommands'
import { scriptsFromDrafts } from './scriptDrafts'

export function importScriptDrafts(
  projectFolder: string,
  drafts: readonly GeneratedScript[]
): void {
  const current = projectStore.getState().current
  if (!current || current.folderPath !== projectFolder || drafts.length === 0) return
  applyProjectCommand(createScriptsCommand(scriptsFromDrafts(drafts)))
  toast.ai({
    title: drafts.length === 1 ? 'Drafted 1 script' : `Drafted ${drafts.length} scripts`,
    description: 'They are in the Scripts list. Undo removes them.'
  })
}
