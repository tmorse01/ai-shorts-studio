// Gallery actions over the typed IPC bridge. Each one reports a failure as an error toast and
// returns a plain result, so the components only decide what to show next.
import type { IpcError } from '@shared/ipc'
import type { RecentProject } from '@shared/project/recentProjects'
import type { Project } from '@shared/project/schema'
import { projectStore } from '../project/projectStore'
import { syncAnalysis } from '../analysis/analysisSync'
import { toast } from '../toasts/toast'

function reportFailure(title: string, error: IpcError): void {
  toast.error({ title, description: error.message, details: error.details })
}

// Makes an opened project the current one and returns its id, or null when it could not be opened.
// A project recovered from its backup also gets a warning, because its latest edits may be missing.
async function adoptOpened(
  folderPath: string,
  project: Project,
  warning?: string
): Promise<string | null> {
  if (warning) {
    toast.error({ title: 'Opened from backup', description: warning })
  }
  const adopted = await projectStore.getState().open({ folderPath, project })
  if (adopted) void syncAnalysis(window.api, folderPath, project.media)
  return adopted ? project.id : null
}

export async function pickFolder(): Promise<string | null> {
  const result = await window.api.invoke('folder:pick', {})
  if (!result.ok) {
    reportFailure('Could not open the folder picker', result.error)
    return null
  }
  return result.data.folderPath
}

export async function defaultFolderFor(name: string): Promise<string | null> {
  const result = await window.api.invoke('project:defaultFolder', { name })
  if (!result.ok) {
    reportFailure('Could not suggest a folder', result.error)
    return null
  }
  return result.data.folderPath
}

// Opens a project folder and makes it current. Resolves the project id, or null on failure.
export async function openProjectFolder(folderPath: string): Promise<string | null> {
  const result = await window.api.invoke('project:open', { folderPath })
  if (!result.ok) {
    reportFailure('Could not open the project', result.error)
    return null
  }
  return adoptOpened(result.data.folderPath, result.data.project, result.data.warning)
}

// Creates a project in a folder and makes it current. Resolves the project id, or null on failure.
export async function createProjectIn(folderPath: string, name: string): Promise<string | null> {
  const result = await window.api.invoke('project:create', { folderPath, name })
  if (!result.ok) {
    reportFailure('Could not create the project', result.error)
    return null
  }
  return adoptOpened(result.data.folderPath, result.data.project, result.data.warning)
}

export async function renameProject(folderPath: string, name: string): Promise<boolean> {
  const result = await window.api.invoke('project:rename', { folderPath, name })
  if (!result.ok) {
    reportFailure('Could not rename the project', result.error)
    return false
  }
  return true
}

export async function revealProject(folderPath: string): Promise<void> {
  const result = await window.api.invoke('folder:reveal', { folderPath })
  if (!result.ok) reportFailure('Could not show the folder', result.error)
}

export async function removeFromList(folderPath: string): Promise<boolean> {
  const result = await window.api.invoke('recent:remove', { folderPath })
  if (!result.ok) {
    reportFailure('Could not remove the project', result.error)
    return false
  }
  return true
}

export async function deleteProjectFolder(folderPath: string): Promise<boolean> {
  const result = await window.api.invoke('project:deleteFolder', { folderPath })
  if (!result.ok) {
    reportFailure('Could not delete the project folder', result.error)
    return false
  }
  return true
}

// Points a missing entry at the folder the user picked. The new folder must hold a project.
export async function locateProject(
  project: RecentProject,
  newFolderPath: string
): Promise<boolean> {
  const result = await window.api.invoke('recent:locate', {
    oldFolderPath: project.folderPath,
    newFolderPath
  })
  if (!result.ok) {
    reportFailure('Could not locate the project', result.error)
    return false
  }
  return true
}
