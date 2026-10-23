import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { binPath, runProcess } from './ffmpeg'
import type { MediaAsset, Short } from '../shared/types'

/** Width of the library card poster. Cards are about 160px wide, so this stays sharp on high-DPI screens. */
export const POSTER_WIDTH = 320

/**
 * Clip frame sizes. `card` is for the sidebar cards. `preview` is for the editor's video frame, which is
 * drawn much larger, so it needs real pixels rather than an upscaled card image.
 */
export const CLIP_FRAME_SIZES = { card: 320, preview: 1080 } as const
export type ClipFrameSize = keyof typeof CLIP_FRAME_SIZES

/** Cached one-frame JPEG for a video asset. Audio has no picture, so it never gets one. */
export function posterFile(userDataDir: string, projectId: string, assetId: string): string {
  return join(userDataDir, 'cache', projectId, assetId, 'poster.jpg')
}

/** Cached frame for a clip, in one size. Lives beside the project's other cache. */
export function clipFrameFile(userDataDir: string, projectId: string, shortId: string, size: ClipFrameSize): string {
  return join(userDataDir, 'cache', projectId, 'clips', `${shortId}-${size}.jpg`)
}

/** Remove every cached size of a clip's frame. */
export function removeClipFrames(userDataDir: string, projectId: string, shortId: string): void {
  for (const size of Object.keys(CLIP_FRAME_SIZES) as ClipFrameSize[]) {
    rmSync(clipFrameFile(userDataDir, projectId, shortId, size), { force: true })
  }
}

/** Frame to show on the card: one second in, or the midpoint of very short clips. */
export function posterTimeSec(durationSec: number): number {
  return Math.min(1, durationSec / 2)
}

/**
 * The frame a clip shows: the first frame of its first cut, so the clip opens on what the short starts with.
 * Zero when the clip has no cuts.
 */
export function clipFrameTimeSec(segments: { startSec: number }[]): number {
  return segments[0]?.startSec ?? 0
}

/**
 * FFmpeg args that write a single JPEG frame at `atSec` using fast input seeking, scaled to `width` but never
 * upscaled past the source. Larger frames get a higher JPEG quality so they keep their detail.
 */
export function buildPosterArgs(input: string, output: string, atSec: number, width = POSTER_WIDTH, quality = 5): string[] {
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
    `scale='min(${width},iw)':-2`,
    '-q:v',
    String(quality),
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
 * Render every size of a clip's frame from the clip's own source. Replaces any earlier frames, so call it
 * whenever the clip's cuts change. Returns false when there is no frame (no source, audio source, or no cuts).
 * Never throws.
 */
export async function renderClipFrame(
  userDataDir: string,
  short: Pick<Short, 'id' | 'projectId' | 'segments'>,
  asset: MediaAsset | null
): Promise<boolean> {
  removeClipFrames(userDataDir, short.projectId, short.id)
  if (!asset || asset.probe.videoCodec === 'none' || !existsSync(asset.path) || short.segments.length === 0) {
    return false
  }
  mkdirSync(join(userDataDir, 'cache', short.projectId, 'clips'), { recursive: true })
  const at = clipFrameTimeSec(short.segments)
  let all = true
  for (const size of Object.keys(CLIP_FRAME_SIZES) as ClipFrameSize[]) {
    const out = clipFrameFile(userDataDir, short.projectId, short.id, size)
    const quality = size === 'preview' ? 2 : 5
    try {
      await runProcess(binPath('ffmpeg'), buildPosterArgs(asset.path, out, at, CLIP_FRAME_SIZES[size], quality))
      all = all && existsSync(out)
    } catch {
      all = false
    }
  }
  return all
}
