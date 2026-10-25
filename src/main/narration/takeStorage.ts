// Writes a finished voiceover take into the project's media folder (Epic 10, #108). The file goes through
// a temp name and a rename, so a half-written WAV is never picked up as footage. The stored path follows
// the same relative-or-absolute rule as imported footage.
import { randomUUID } from 'node:crypto'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storedMediaPath } from '../media/mediaPaths'
import type { PathKind } from '@shared/project/schema'

export interface SavedTake {
  path: string
  pathKind: PathKind
  fileName: string
  sizeBytes: number
}

export function narrationTakeDir(projectFolder: string): string {
  return join(projectFolder, 'media', 'narration')
}

export async function saveNarrationTake(
  projectFolder: string,
  bytes: Uint8Array
): Promise<SavedTake> {
  const dir = narrationTakeDir(projectFolder)
  await mkdir(dir, { recursive: true })
  const fileName = `take-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.wav`
  const target = join(dir, fileName)
  const tmp = `${target}.${process.pid}.tmp`
  await writeFile(tmp, bytes)
  await rename(tmp, target)
  const stored = storedMediaPath(projectFolder, target)
  const { size } = await stat(target)
  return { path: stored.path, pathKind: stored.pathKind, fileName, sizeBytes: size }
}
