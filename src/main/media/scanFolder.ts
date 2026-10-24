// Walks a folder tree and returns the files whose names are wanted. Only matching names are
// stat'ed, so a large footage drive is read once by name, not once per file.
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Dirent } from 'node:fs'
import type { ScannedFile } from '@shared/project/mediaRelink'

// `wantedNames` holds lower-case file names. Folders that cannot be read are skipped, not fatal.
// Results are sorted by path so the match order is stable.
export async function scanFolderForFiles(
  root: string,
  wantedNames: ReadonlySet<string>
): Promise<ScannedFile[]> {
  const found: ScannedFile[] = []
  await walk(root, wantedNames, found)
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

async function walk(dir: string, wantedNames: ReadonlySet<string>, found: ScannedFile[]) {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(path, wantedNames, found)
    } else if (entry.isFile() && wantedNames.has(entry.name.toLowerCase())) {
      try {
        const info = await stat(path)
        found.push({ path, fileName: entry.name, sizeBytes: info.size })
      } catch {
        // The file vanished or cannot be read: it simply does not match.
      }
    }
  }
}
