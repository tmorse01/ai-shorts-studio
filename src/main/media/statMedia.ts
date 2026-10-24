// Reads the name and size of each picked or dropped path. A path that is missing, or is not a file,
// is reported in `missing` rather than failing the whole batch.
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ImportCandidate } from '@shared/media/importFiles'

export interface StatResult {
  files: ImportCandidate[]
  missing: string[]
}

export async function statMediaFiles(paths: readonly string[]): Promise<StatResult> {
  const result: StatResult = { files: [], missing: [] }
  for (const path of paths) {
    try {
      const info = await stat(path)
      if (info.isFile()) {
        result.files.push({ path, fileName: basename(path), sizeBytes: info.size })
      } else {
        result.missing.push(path)
      }
    } catch {
      result.missing.push(path)
    }
  }
  return result
}
