// Imports picked or dropped files into the open project. Files are referenced in place, added as one
// undoable command, and probed in the background. Failures show as toasts; nothing here throws.
import { planImport } from '@shared/media/importFiles'
import type { MediaRef } from '@shared/project/schema'
import { projectStore } from '../project/projectStore'
import { toast } from '../toasts/toast'
import { importMediaCommand } from './mediaCommands'

// Where a media ref's file is. Relative refs resolve against the project folder.
function absolutePathOf(ref: MediaRef, folderPath: string): string {
  return ref.pathKind === 'absolute' ? ref.path : `${folderPath}/${ref.path}`
}

// Probes an imported file and records its duration. A failed probe already shows a toast from the job
// watcher, so a failure here only leaves the ref pending.
async function probeImported(mediaId: string, path: string): Promise<void> {
  const result = await window.api.invoke('media:probe', { path })
  if (!result.ok) return
  const durationMs = Math.round(result.data.durationSec * 1000)
  projectStore.getState().edit((draft) => {
    const ref = draft.media.find((media) => media.id === mediaId)
    if (ref) ref.durationMs = durationMs
  })
}

export async function importMediaPaths(paths: readonly string[]): Promise<void> {
  const opened = projectStore.getState().current
  if (!opened || paths.length === 0) return

  const stat = await window.api.invoke('media:stat', { paths: [...paths] })
  if (!stat.ok) {
    toast.error({
      title: 'Could not read the files',
      description: stat.error.message,
      details: stat.error.details
    })
    return
  }

  if (stat.data.missing.length > 0) {
    toast.error({
      title: 'Some files were not found',
      description: stat.data.missing.join(', ')
    })
  }

  const plan = planImport(
    opened.project.media.map((ref) => ({
      path: absolutePathOf(ref, opened.folderPath),
      sizeBytes: ref.sizeBytes
    })),
    stat.data.files
  )

  if (plan.duplicates.length > 0) {
    toast.info({
      title: 'Already in this project',
      description: plan.duplicates.map((file) => file.fileName).join(', ')
    })
  }
  if (plan.rejected.length > 0) {
    toast.error({
      title: 'Some files were not imported',
      description: plan.rejected.map((file) => `${file.fileName}: ${file.reason}`).join(' ')
    })
  }
  if (plan.accepted.length === 0) return

  // The user may have switched projects while the files were read. Only import into the same one.
  if (projectStore.getState().current?.folderPath !== opened.folderPath) return

  const refs: MediaRef[] = plan.accepted.map((file) => ({
    id: crypto.randomUUID(),
    path: file.path,
    pathKind: 'absolute',
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    kind: file.kind
  }))
  const command = importMediaCommand(refs)
  projectStore.getState().edit((draft) => command.produce(draft))

  for (const ref of refs) {
    if (ref.kind !== 'image') void probeImported(ref.id, ref.path)
  }
}

// Native picker, then import. Does nothing when no project is open.
export async function pickAndImportMedia(): Promise<void> {
  if (!projectStore.getState().current) return
  const picked = await window.api.invoke('media:pick', {})
  if (!picked.ok) {
    toast.error({
      title: 'Could not open the file picker',
      description: picked.error.message,
      details: picked.error.details
    })
    return
  }
  await importMediaPaths(picked.data.paths)
}
