import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { binPath, ProcessCancelledError, runProcess } from './ffmpeg'
import type { CandidateWindow, FrameSample } from './ai'
import type { SceneDetection } from '../shared/schemas'

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

/** NVIDIA hardware decoder for a source codec, or null when NVDEC has no decoder for it. */
export function gpuDecoderFor(videoCodec: string): string | null {
  if (videoCodec === 'h264') return 'h264_cuvid'
  if (videoCodec === 'hevc') return 'hevc_cuvid'
  return null
}

/**
 * ffmpeg argv for scene detection.
 *
 * - `gpuDecoder` (e.g. `h264_cuvid`) decodes on NVDEC and scales on the GPU, so only small frames
 *   are copied back for the CPU `select` filter. `-surfaces 8` is needed: the default surface count
 *   made decoder creation fail on the bundled build.
 * - `keyframes` sets `-skip_frame nokey` as an input option so the CPU decoder only produces
 *   I-frames. That is what makes it fast, and why it can miss mid-GOP cuts. NVDEC ignores it, so
 *   the keyframe mode never uses the GPU path.
 */
export function sceneDetectArgs(
  sourcePath: string,
  mode: Exclude<SceneDetection, 'off'>,
  gpuDecoder: string | null
): string[] {
  const select = `select='gt(scene,${SCENE_THRESHOLD})',showinfo`
  const gpu = gpuDecoder !== null && mode === 'full'
  return [
    '-hide_banner',
    '-nostats',
    ...(gpu ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-c:v', gpuDecoder, '-surfaces', '8'] : []),
    ...(mode === 'keyframes' ? ['-skip_frame', 'nokey'] : []),
    '-i',
    sourcePath,
    '-an',
    '-vf',
    gpu ? `scale_cuda=w=640:h=-2,hwdownload,format=nv12,${select}` : select,
    '-f',
    'null',
    '-'
  ]
}

/**
 * Scene cut times for a source. Tries NVDEC first when the codec has a decoder, then falls back to
 * the CPU if the GPU run fails. Cancellation is not a failure and is never retried.
 */
export async function detectSceneCuts(
  sourcePath: string,
  mode: Exclude<SceneDetection, 'off'>,
  videoCodec: string,
  onSpawn: (child: ChildProcessWithoutNullStreams) => void
): Promise<number[]> {
  const gpuDecoder = gpuDecoderFor(videoCodec)
  if (gpuDecoder && mode === 'full') {
    try {
      const stderr = await runProcess(binPath('ffmpeg'), sceneDetectArgs(sourcePath, mode, gpuDecoder), { onSpawn })
      return parseSceneTimes(stderr)
    } catch (err) {
      if (err instanceof ProcessCancelledError) throw err
    }
  }
  const stderr = await runProcess(binPath('ffmpeg'), sceneDetectArgs(sourcePath, mode, null), { onSpawn })
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
