import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { binPath, runProcess } from './ffmpeg'
import type { CandidateWindow, FrameSample } from './ai'

/** Hard limits that keep cost and memory bounded regardless of footage length. */
export const MAX_CANDIDATES = 40
export const MAX_FRAMES = 40
export const FRAME_WIDTH = 512
export const SCENE_THRESHOLD = 0.3
const MAX_SCENE_CUTS = 200

/**
 * Build candidate windows from an even grid plus detected scene cuts, de-duplicated by start time.
 * Windows are at most `targetSec` long and never run past the end of the source.
 */
export function makeCandidates(
  durationSec: number,
  minSec: number,
  maxSec: number,
  sceneCutsSec: number[]
): CandidateWindow[] {
  const targetSec = Math.min(durationSec, (minSec + maxSec) / 2)
  const latestStart = Math.max(0, durationSec - targetSec)
  const step = Math.max(targetSec / 2, durationSec / MAX_CANDIDATES)

  const starts: number[] = []
  for (let t = 0; t <= latestStart + 1e-6; t += step) starts.push(t)
  for (const cut of sceneCutsSec) {
    starts.push(Math.min(Math.max(0, cut), latestStart))
  }
  starts.sort((a, b) => a - b)

  const unique: number[] = []
  for (const s of starts) {
    const last = unique[unique.length - 1]
    if (last === undefined || s - last >= 2) unique.push(s)
  }

  const sampled = sampleEvenly(unique, MAX_CANDIDATES)
  return sampled.map((start, i) => ({
    index: i,
    startSec: round2(start),
    endSec: round2(Math.min(durationSec, start + targetSec))
  }))
}

/** Pick `limit` items spread across the list, keeping first and last. */
export function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items
  const out: T[] = []
  for (let i = 0; i < limit; i++) {
    out.push(items[Math.round((i * (items.length - 1)) / (limit - 1))])
  }
  return out
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Midpoint of each candidate, which is where the single frame sample is taken. */
export function frameTimes(candidates: CandidateWindow[]): number[] {
  return sampleEvenly(
    candidates.map((c) => (c.startSec + c.endSec) / 2),
    MAX_FRAMES
  )
}

/** Parse ffmpeg showinfo lines: `pts_time:12.345`. */
export function parseSceneTimes(stderr: string): number[] {
  const times: number[] = []
  for (const m of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const t = Number(m[1])
    if (Number.isFinite(t)) times.push(t)
  }
  return sampleEvenly(times, MAX_SCENE_CUTS)
}

export async function detectSceneCuts(
  sourcePath: string,
  onSpawn: (child: ChildProcessWithoutNullStreams) => void
): Promise<number[]> {
  const stderr = await runProcess(
    binPath('ffmpeg'),
    [
      '-hide_banner',
      '-nostats',
      '-i',
      sourcePath,
      '-an',
      '-vf',
      `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      '-f',
      'null',
      '-'
    ],
    { onSpawn }
  )
  return parseSceneTimes(stderr)
}

/** Extract one downscaled JPEG frame at `timeSec` using fast input seeking. */
export async function extractFrame(
  sourcePath: string,
  timeSec: number,
  outDir: string,
  index: number,
  onSpawn: (child: ChildProcessWithoutNullStreams) => void
): Promise<FrameSample> {
  const file = join(outDir, `frame-${String(index).padStart(3, '0')}.jpg`)
  await runProcess(
    binPath('ffmpeg'),
    [
      '-hide_banner',
      '-nostats',
      '-ss',
      timeSec.toFixed(3),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${FRAME_WIDTH}:-2`,
      '-q:v',
      '6',
      '-y',
      file
    ],
    { onSpawn }
  )
  return { index, timeSec, jpeg: readFileSync(file) }
}

export function makeAnalysisScratch(userDataDir: string, projectId: string, jobId: string): string {
  const dir = join(userDataDir, 'cache', projectId, `analysis-${jobId}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function removeScratch(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
