// Reads and writes one clip's suggestion file (analysis/suggestions/<mediaId>.json): the moments the last
// search found and the keys the user dismissed. The file sits in the analysis folder, outside cache/, so
// Clear cache keeps the dismissals. A damaged file is treated as empty. Same atomic write as the others.
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  emptySuggestionsFile,
  suggestionsFileSchema,
  type SuggestionsFile
} from '@shared/analysis/suggestions'
import { ANALYSIS_DIR } from './analysisFile'

export const SUGGESTIONS_DIR = 'suggestions'

export function suggestionsPath(projectFolder: string, mediaId: string): string {
  return join(projectFolder, ANALYSIS_DIR, SUGGESTIONS_DIR, `${mediaId}.json`)
}

export async function loadSuggestionsFile(file: string): Promise<SuggestionsFile> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptySuggestionsFile()
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return emptySuggestionsFile()
  }
  const parsed = suggestionsFileSchema.safeParse(json)
  return parsed.success ? parsed.data : emptySuggestionsFile()
}

export async function saveSuggestionsFile(file: string, data: SuggestionsFile): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  const text = `${JSON.stringify(suggestionsFileSchema.parse(data), null, 2)}\n`
  try {
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
