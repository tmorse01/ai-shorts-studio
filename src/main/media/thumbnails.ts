// Builds the thumbnail and filmstrip files for one media item into its cache folder. Argument lists are
// pure so they are tested directly; the runners pass them to FFmpeg.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  FILMSTRIP_FILE,
  filmstripPlan,
  thumbFileName,
  type FilmstripPlan
} from '@shared/media/thumbs'
import type { MediaKind } from '@shared/project/schema'
import { UserFacingError } from '../errors'
import { runTool } from './runTool'

// Cache folder for one media item, under the project's cache folder.
export function thumbCacheDir(projectFolder: string, mediaId: string): string {
  return join(projectFolder, 'cache', 'thumbs', mediaId)
}

export function posterArgs(src: string, out: string): string[] {
  return ['-y', '-v', 'error', '-ss', '0', '-i', src, '-frames:v', '1', '-vf', 'scale=320:-2', out]
}

export function imageThumbArgs(src: string, out: string): string[] {
  return ['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-vf', 'scale=320:-2', out]
}

export function waveformArgs(src: string, out: string): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-i',
    src,
    '-filter_complex',
    'showwavespic=s=320x64',
    '-frames:v',
    '1',
    out
  ]
}

export function filmstripArgs(src: string, out: string, plan: FilmstripPlan): string[] {
  const filter = `fps=1/${plan.intervalSec},scale=160:-2,tile=${plan.columns}x${plan.rows}`
  return ['-y', '-v', 'error', '-i', src, '-vf', filter, '-frames:v', '1', out]
}

export interface ThumbRunOptions {
  ffmpeg: string
  signal?: AbortSignal
}

// Makes the thumbnail for a media item of the given kind: a poster frame, a small image, or a waveform.
export async function makeThumb(
  kind: MediaKind,
  src: string,
  outDir: string,
  options: ThumbRunOptions
): Promise<void> {
  await mkdir(outDir, { recursive: true })
  const out = join(outDir, thumbFileName(kind))
  const args =
    kind === 'video'
      ? posterArgs(src, out)
      : kind === 'image'
        ? imageThumbArgs(src, out)
        : waveformArgs(src, out)
  await runTool(options.ffmpeg, args, options.signal)
}

// Makes the filmstrip of a video. Needs the duration, which the probe reports.
export async function makeFilmstrip(
  src: string,
  outDir: string,
  durationSec: number,
  options: ThumbRunOptions
): Promise<void> {
  if (!(durationSec > 0)) {
    throw new UserFacingError('The filmstrip needs the length of the video.')
  }
  await mkdir(outDir, { recursive: true })
  const out = join(outDir, FILMSTRIP_FILE)
  await runTool(options.ffmpeg, filmstripArgs(src, out, filmstripPlan(durationSec)), options.signal)
}
