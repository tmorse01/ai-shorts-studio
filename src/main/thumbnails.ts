import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/** Upper bound on thumbnails per project, so long footage does not produce thousands of files. */
export const MAX_THUMBNAILS = 120
export const MIN_THUMB_STEP_SEC = 1
export const THUMB_WIDTH = 160

const metaSchema = z.object({
  stepSec: z.number().positive(),
  count: z.number().int().positive()
})

export interface ThumbMeta {
  stepSec: number
  count: number
}

/** Seconds between thumbnails: as dense as possible while staying under MAX_THUMBNAILS. */
export function thumbnailStep(durationSec: number): number {
  return Math.max(MIN_THUMB_STEP_SEC, Math.ceil(durationSec / MAX_THUMBNAILS))
}

/** Thumbnails belong to one media asset, so each video in a project gets its own strip. */
export function thumbDir(userDataDir: string, projectId: string, assetId: string): string {
  return join(userDataDir, 'cache', projectId, assetId, 'thumbs')
}

/** File name for the Nth thumbnail (0-based index). FFmpeg writes them 1-based. */
export function thumbFileName(index: number): string {
  return `thumb-${String(index + 1).padStart(4, '0')}.jpg`
}

/**
 * FFmpeg args that write one scaled JPEG every `stepSec` seconds in a single decode pass. Progress goes
 * to stdout so the job can report it.
 */
export function buildThumbArgs(input: string, outDir: string, stepSec: number): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-progress',
    'pipe:1',
    '-i',
    input,
    '-an',
    '-vf',
    `fps=1/${stepSec},scale=${THUMB_WIDTH}:-2`,
    '-q:v',
    '6',
    join(outDir, 'thumb-%04d.jpg')
  ]
}

export function readThumbMeta(dir: string): ThumbMeta | null {
  const file = join(dir, 'meta.json')
  if (!existsSync(file)) return null
  try {
    return metaSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

export function writeThumbMeta(dir: string, meta: ThumbMeta): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta), 'utf8')
}

/** Thumbnails are ready when the metadata exists and every listed image is on disk. */
export function thumbsReady(dir: string): ThumbMeta | null {
  const meta = readThumbMeta(dir)
  if (!meta) return null
  for (let i = 0; i < meta.count; i++) {
    if (!existsSync(join(dir, thumbFileName(i)))) return null
  }
  return meta
}
