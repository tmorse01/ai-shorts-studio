// "Relink folder": finds offline footage under a folder by file name and size, points each match at
// its new location, and saves project.json once. Unmatched media stays offline and is reported.
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { produce } from 'immer'
import type { Project } from '@shared/project/schema'
import {
  matchOfflineMedia,
  relinkMediaRecipe,
  type MediaLocation
} from '@shared/project/mediaRelink'
import { UserFacingError } from '../errors'
import { openProject, saveProject } from '../project/projectStorage'
import { offlineMediaIds, storedMediaPath } from './mediaPaths'
import { scanFolderForFiles } from './scanFolder'

export interface RelinkResult {
  folderPath: string
  project: Project
  offlineMediaIds: string[]
  relinkedCount: number
  // File names of offline media that the searched folder did not contain.
  unmatchedFileNames: string[]
}

export async function relinkMediaFolder(
  folderPath: string,
  searchFolder: string
): Promise<RelinkResult> {
  const opened = await openProject(folderPath)
  const { project, offlineMediaIds: offlineIds } = opened
  const offline = project.media.filter((ref) => offlineIds.includes(ref.id))

  const root = resolve(searchFolder)
  if (offline.length === 0) {
    return result(opened.folderPath, project, offlineIds, 0, [])
  }
  if (!(await isDirectory(root))) {
    throw new UserFacingError('That folder does not exist.', root)
  }

  const wantedNames = new Set(offline.map((ref) => ref.fileName.toLowerCase()))
  const files = await scanFolderForFiles(root, wantedNames)
  const { matches, unmatched } = matchOfflineMedia(offline, files)
  const unmatchedFileNames = unmatched.map((ref) => ref.fileName)

  const locations: MediaLocation[] = matches.map((match) => ({
    mediaId: match.mediaId,
    ...storedMediaPath(opened.folderPath, match.path)
  }))
  if (locations.length === 0) {
    return result(opened.folderPath, project, offlineIds, 0, unmatchedFileNames)
  }

  const relinked = produce(project, relinkMediaRecipe(locations))
  await saveProject(opened.folderPath, relinked)
  return result(
    opened.folderPath,
    relinked,
    await offlineMediaIds(opened.folderPath, relinked.media),
    locations.length,
    unmatchedFileNames
  )
}

function result(
  folderPath: string,
  project: Project,
  offlineIds: string[],
  relinkedCount: number,
  unmatchedFileNames: string[]
): RelinkResult {
  return { folderPath, project, offlineMediaIds: offlineIds, relinkedCount, unmatchedFileNames }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
