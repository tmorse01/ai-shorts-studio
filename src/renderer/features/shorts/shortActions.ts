// Applies a project-level command to the open project. The edit autosaves. Project history is not
// wired to the app yet, so these edits are not on an undo stack.
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'
import { projectStore } from '../project/projectStore'

export function applyProjectCommand(command: Command<Project>): void {
  projectStore.getState().edit((draft) => command.produce(draft))
}
