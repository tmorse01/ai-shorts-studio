// Reads and writes one media item's vision results (analysis/vision/<mediaId>.json). The file sits in the
// project's analysis folder, outside cache/, so Clear cache keeps it. A damaged file is treated as
// missing, since descriptions can be made again. Same atomic write as the analysis file.
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { visionResultFileSchema, type VisionResultFile } from '@shared/analysis/vision'

export async function loadVisionResult(file: string): Promise<VisionResultFile | undefined> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  const parsed = visionResultFileSchema.safeParse(json)
  return parsed.success ? parsed.data : undefined
}

export async function saveVisionResult(file: string, result: VisionResultFile): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  const text = `${JSON.stringify(visionResultFileSchema.parse(result), null, 2)}\n`
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
