// Project-level edits. Each command runs through the project history, so undo and redo can bring
// back the exact project it replaced: same ids, order and content. The result is written to the
// project store, which autosaves it.
import type { Project } from '@shared/project/schema'
import { createHistoryStore, type Command, type HistoryApi } from '../history/historyStore'
import { projectStore } from '../project/projectStore'

let history: HistoryApi<Project> | null = null

// The history for the open project. It starts again when the project object was replaced by an edit
// outside the history, or when another project opened, because its undo steps no longer match.
function historyFor(project: Project): HistoryApi<Project> {
  if (!history) {
    history = createHistoryStore(project)
  } else if (history.getState().present !== project) {
    history.getState().reset(project)
  }
  return history
}

// Forgets the project's undo steps, for example when another project opens.
export function clearProjectHistory(): void {
  history = null
}

function publish(next: Project): void {
  projectStore.getState().replaceProject(next)
}

export function applyProjectCommand(command: Command<Project>): void {
  const current = projectStore.getState().current
  if (!current) return
  const project = historyFor(current.project)
  if (project.getState().execute(command)) publish(project.getState().present)
}

// Undoes the last project-level edit. Returns false when there is nothing to undo.
export function undoProjectEdit(): boolean {
  const current = projectStore.getState().current
  if (!current || !history) return false
  const project = historyFor(current.project)
  if (!project.getState().undo()) return false
  publish(project.getState().present)
  return true
}

// Whether the open project has an undo step or a redo step. Used to enable the top bar buttons.
export function canUndoProjectEdit(): boolean {
  return history !== null && history.getState().past.length > 0
}

export function canRedoProjectEdit(): boolean {
  return history !== null && history.getState().future.length > 0
}

export function redoProjectEdit(): boolean {
  const current = projectStore.getState().current
  if (!current || !history) return false
  const project = historyFor(current.project)
  if (!project.getState().redo()) return false
  publish(project.getState().present)
  return true
}
