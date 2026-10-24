// Makes the 720p proxy for one video. Writes to a .partial file and renames it only when FFmpeg
// finishes, so a cancelled or failed run never leaves a file that looks ready.
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { proxyArgs, proxyProgressFromLine } from '@shared/media/proxy'
import { runTool } from './runTool'

export interface ProxyRunOptions {
  ffmpeg: string
  signal?: AbortSignal
  /** Reports progress as a fraction from 0 to 1. */
  onProgress: (fraction: number) => void
}

export async function makeProxy(
  src: string,
  outPath: string,
  durationSec: number,
  options: ProxyRunOptions
): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true })
  const partial = `${outPath}.partial`
  try {
    await runTool(options.ffmpeg, proxyArgs(src, partial), options.signal, (chunk) => {
      for (const line of chunk.split('\n')) {
        const fraction = proxyProgressFromLine(line, durationSec)
        if (fraction !== undefined) options.onProgress(fraction)
      }
    })
    await rename(partial, outPath)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}
