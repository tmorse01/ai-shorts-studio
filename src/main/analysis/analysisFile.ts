// Reads and writes the analysis file kept in the project folder (analysis/analysis.json). It is a
// separate file, not part of project.json, so analysis does not change the project schema. Analysis
// results can be rebuilt, so a damaged file is treated as empty instead of blocking the project.
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { analysisFileSchema, emptyAnalysisFile, type AnalysisFile } from '@shared/analysis/analysis'

export const ANALYSIS_DIR = 'analysis'
export const ANALYSIS_FILE = 'analysis.json'

export async function loadAnalysisFile(projectFolder: string): Promise<AnalysisFile> {
  let text: string
  try {
    text = await readFile(join(projectFolder, ANALYSIS_DIR, ANALYSIS_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyAnalysisFile()
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return emptyAnalysisFile()
  }
  const parsed = analysisFileSchema.safeParse(json)
  return parsed.success ? parsed.data : emptyAnalysisFile()
}

// Same atomic pattern as project.json: write a temp file, flush it, then rename it over the target.
export async function saveAnalysisFile(projectFolder: string, file: AnalysisFile): Promise<void> {
  const dir = join(projectFolder, ANALYSIS_DIR)
  await mkdir(dir, { recursive: true })
  const target = join(dir, ANALYSIS_FILE)
  const tmp = join(dir, `${ANALYSIS_FILE}.${process.pid}.${randomUUID()}.tmp`)
  const text = `${JSON.stringify(analysisFileSchema.parse(file), null, 2)}\n`
  try {
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
