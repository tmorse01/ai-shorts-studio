// Renders the poster frame of a short: one still from the footage under the frame, written into the
// short's folder under cache/posters. Argument lists are pure so they are tested directly; the runner
// passes them to FFmpeg.
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { posterFileName, type PosterFrameRef } from '@shared/shorts/poster'
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
  } catch (error) {
    await rm(outPath, { force: true })
    throw error
  }
}

// The poster frame as a data URL, or null while it is not rendered yet.
export async function readPosterDataUrl(
  projectFolder: string,
  frame: PosterFrameRef
): Promise<{ dataUrl: string | null }> {
  try {
    const bytes = await readFile(posterFramePath(projectFolder, frame))
    return { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` }
  } catch {
    return { dataUrl: null }
  }
}
