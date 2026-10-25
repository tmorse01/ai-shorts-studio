// Renders the poster frame of a short: one still from the footage under the frame, written into the
// short's folder under cache/posters. Argument lists are pure so they are tested directly; the runner
// passes them to FFmpeg.
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { posterFileName, type PosterFrameRef } from '@shared/shorts/poster'
import { UserFacingError } from '../errors'
import { runTool } from './runTool'

// Cache folder for one short's poster frames, under the project's cache folder.
export function posterCacheDir(projectFolder: string, shortId: string): string {
  return join(projectFolder, 'cache', 'posters', shortId)
}

// The cache file for one poster frame.
export function posterFramePath(projectFolder: string, frame: PosterFrameRef): string {
  return join(posterCacheDir(projectFolder, frame.shortId), posterFileName(frame))
}

// One frame at the given time, scaled like the thumbnails. The seek comes before the input for speed.
export function posterFrameArgs(src: string, out: string, sourceTimeSec: number): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-ss',
    sourceTimeSec.toFixed(3),
    '-i',
    src,
    '-frames:v',
    '1',
    '-vf',
    'scale=320:-2',
    out
  ]
}

export interface PosterRunOptions {
  ffmpeg: string
  signal?: AbortSignal
}

// True when a non-empty file exists at the path. An empty file is not a frame: it would show as a
// broken image, so it is treated as missing and rendered again.
export async function hasFrame(file: string): Promise<boolean> {
  try {
    const info = await stat(file)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

// Writes the poster frame. A failed or cancelled run leaves no file behind, so the next request
// renders it again instead of reusing a broken image.
export async function makePosterFrame(
  src: string,
  outPath: string,
  sourceTimeSec: number,
  options: PosterRunOptions
): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true })
  try {
    await runTool(options.ffmpeg, posterFrameArgs(src, outPath, sourceTimeSec), options.signal)
    // FFmpeg can exit 0 without writing a frame, for example when the seek is past the end of the file.
    if (!(await hasFrame(outPath))) {
      throw new UserFacingError('That frame could not be read from the footage.')
    }
  } catch (error) {
    await rm(outPath, { force: true })
    throw error
  }
}

// Whether the poster frame is rendered and readable. The renderer then loads it through the protocol.
export async function posterRendered(
  projectFolder: string,
  frame: PosterFrameRef
): Promise<{ rendered: boolean }> {
  return { rendered: await hasFrame(posterFramePath(projectFolder, frame)) }
}
