// Turns stored media paths into real paths and checks whether the footage is still on disk.
// Footage is referenced in place. A path is stored relative to the project folder when the file is
// inside that folder or directly in its parent folder, otherwise it is stored absolute.
import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { MediaRef, PathKind } from '@shared/project/schema'

export interface StoredPath {
  path: string
  pathKind: PathKind
}

// The form a media file's path takes in project.json. Relative paths use forward slashes so a
// project folder moves between machines.
export function storedMediaPath(projectFolder: string, mediaFile: string): StoredPath {
  const rel = relative(resolve(projectFolder), resolve(mediaFile))
  if (isAbsolute(rel)) return { path: resolve(mediaFile), pathKind: 'absolute' }

  const parts = rel.split(sep)
  const inside = parts[0] !== '..'
  const nextTo = parts.length === 2 && parts[0] === '..' && parts[1] !== '..'
  if (inside || nextTo) return { path: parts.join('/'), pathKind: 'relative' }
  return { path: resolve(mediaFile), pathKind: 'absolute' }
}

// The absolute path of a media item, given the project folder it was stored in.
export function resolveMediaPath(projectFolder: string, ref: MediaRef): string {
  return ref.pathKind === 'relative' ? resolve(projectFolder, ref.path) : ref.path
}

// True when the media file is on disk right now. Any failure to read it counts as offline.
export async function isMediaOnline(projectFolder: string, ref: MediaRef): Promise<boolean> {
  try {
    return (await stat(resolveMediaPath(projectFolder, ref))).isFile()
  } catch {
    return false
  }
}

// Ids of the media items whose files cannot be found, in project order.
export async function offlineMediaIds(
  projectFolder: string,
  media: readonly MediaRef[]
): Promise<string[]> {
  const checks = await Promise.all(media.map((ref) => isMediaOnline(projectFolder, ref)))
  return media.filter((_ref, index) => !checks[index]).map((ref) => ref.id)
}
