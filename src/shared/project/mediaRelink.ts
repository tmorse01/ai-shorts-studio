// Pure media relink logic shared by main (scan, match, save) and the renderer (the undoable relink
// command). No file access here: main supplies the scanned files and stores the result.
import type { MediaRef, PathKind } from './schema'

export interface ScannedFile {
  // Absolute path of the file on disk.
  path: string
  fileName: string
  sizeBytes: number
}

// An offline media item and the absolute path of the file that matched it.
export interface MediaMatch {
  mediaId: string
  path: string
}

// Where a media item lives after a relink, already in the stored form (relative or absolute).
export interface MediaLocation {
  mediaId: string
  path: string
  pathKind: PathKind
}

export interface MatchResult {
  matches: MediaMatch[]
  unmatched: MediaRef[]
}

// Matches offline media to scanned files by file name and size. File names compare without case,
// as they do on Windows. When several files share a name and size, the first one in the list wins,
// so pass the list in a stable order.
export function matchOfflineMedia(
  offline: readonly MediaRef[],
  files: readonly ScannedFile[]
): MatchResult {
  const pathByKey = new Map<string, string>()
  for (const file of files) {
    const key = mediaKey(file.fileName, file.sizeBytes)
    if (!pathByKey.has(key)) pathByKey.set(key, file.path)
  }

  const matches: MediaMatch[] = []
  const unmatched: MediaRef[] = []
  for (const ref of offline) {
    const path = pathByKey.get(mediaKey(ref.fileName, ref.sizeBytes))
    if (path === undefined) unmatched.push(ref)
    else matches.push({ mediaId: ref.id, path })
  }
  return { matches, unmatched }
}

// Immer recipe that points each located media item at its new path. It is the body of the relink
// command, so one undo step restores every path it changed.
export function relinkMediaRecipe(
  locations: readonly MediaLocation[]
): (draft: { media: MediaRef[] }) => void {
  return (draft) => {
    for (const location of locations) {
      const ref = draft.media.find((item) => item.id === location.mediaId)
      if (!ref) continue
      ref.path = location.path
      ref.pathKind = location.pathKind
    }
  }
}

function mediaKey(fileName: string, sizeBytes: number): string {
  return `${fileName.toLowerCase()}\u0000${sizeBytes}`
}
