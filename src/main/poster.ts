import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { binPath, runProcess } from './ffmpeg'
import type { MediaAsset, Short } from '../shared/types'

/** Width of the library card poster. Cards are about 160px wide, so this stays sharp on high-DPI screens. */
export const POSTER_WIDTH = 320

/** Cached one-frame JPEG for a video asset. Audio has no picture, so it never gets one. */
export function posterFile(userDataDir: string, projectId: string, assetId: string): string {
  return join(userDataDir, 'cache', projectId, assetId, 'poster.jpg')
}

/** Cached frame for a clip card, one per short. Lives beside the project's other cache. */
export function clipFrameFile(userDataDir: string, projectId: string, shortId: string): string {
  return join(userDataDir, 'cache', projectId, 'clips', `${shortId}.jpg`)
}

/** Frame to show on the card: one second in, or the midpoint of very short clips. */
export function posterTimeSec(durationSec: number): number {
  return Math.min(1, durationSec / 2)
}

/**
 * The frame a clip card shows: the first frame of its first cut, so the card matches what the short opens
 * on. Zero when the clip has no cuts.
 */
export function clipFrameTimeSec(segments: { startSec: number }[]): number {
  return segments[0]?.startSec ?? 0
}

/** FFmpeg args that write a single scaled JPEG frame at `atSec` using fast input seeking. */
export function buildPosterArgs(input: string, output: string, atSec: number): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-ss',
    atSec.toFixed(3),
    '-i',
    input,
    '-frames:v',
    '1',
    '-an',
    '-vf',
    `scale=${POSTER_WIDTH}:-2`,
    '-q:v',
    '5',
    output
  ]
}

/**
 * Make sure a video asset has a poster. Skips audio, missing files and posters that already exist. Never
 * throws: a card without a poster just shows a placeholder.
 */
export async function ensurePoster(userDataDir: string, projectId: string, asset: MediaAsset): Promise<boolean> {
  if (asset.probe.videoCodec === 'none' || !existsSync(asset.path)) return false
  const out = posterFile(userDataDir, projectId, asset.id)
  if (existsSync(out)) return true
  mkdirSync(join(userDataDir, 'cache', projectId, asset.id), { recursive: true })
  try {
    await runProcess(binPath('ffmpeg'), buildPosterArgs(asset.path, out, posterTimeSec(asset.probe.durationSec)))
    return existsSync(out)
  } catch {
    return false
  }
}

/**
 * Render the clip card frame from the clip's own source. Replaces any earlier frame, so call it whenever the
 * clip's cuts change. Returns false when there is no frame (no source, audio source, or no cuts). Never throws.
 */
export async function renderClipFrame(
  userDataDir: string,
  short: Pick<Short, 'id' | 'projectId' | 'segments'>,
  asset: MediaAsset | null
): Promise<boolean> {
  const out = clipFrameFile(userDataDir, short.projectId, short.id)
  rmSync(out, { force: true })
  if (!asset || asset.probe.videoCodec === 'none' || !existsSync(asset.path) || short.segments.length === 0) {
    return false
  }
  mkdirSync(join(userDataDir, 'cache', short.projectId, 'clips'), { recursive: true })
  try {
    await runProcess(binPath('ffmpeg'), buildPosterArgs(asset.path, out, clipFrameTimeSec(short.segments)))
    return existsSync(out)
  } catch {
    return false
  }
}
