// When footage needs a 720p edit copy, the proxy's file name, the FFmpeg arguments that make it, and
// which file playback reads. Pure, so the rules are tested without FFmpeg or the disk.
import type { MediaRef } from '../project/schema'

export const PROXY_HEIGHT = 720
// Footage whose shorter side is above this (1080p) gets a proxy.
export const PROXY_MAX_SHORT_SIDE = 1080
// Above this average bitrate, footage gets a proxy even at 1080p or below.
export const PROXY_HIGH_BITRATE_BPS = 50_000_000

export interface ProxyVideo {
  width: number
  height: number
  // ffprobe codec name, for example 'h264', 'hevc' or 'prores'.
  codec: string
}

// Average bitrate in bits a second, from the file size and the probed duration.
export function averageBitrateBps(sizeBytes: number, durationSec: number): number {
  return durationSec > 0 ? (sizeBytes * 8) / durationSec : 0
}

export function needsProxy(video: ProxyVideo, bitrateBps: number): boolean {
  const codec = video.codec.toLowerCase()
  if (Math.min(video.width, video.height) > PROXY_MAX_SHORT_SIDE) return true
  if (codec.includes('hevc') || codec.includes('h265') || codec.includes('prores')) return true
  return bitrateBps > PROXY_HIGH_BITRATE_BPS
}

export function proxyFileName(mediaId: string): string {
  return `${mediaId}.mp4`
}

// The 720p H.264 copy. -progress pipe:1 streams out_time_ms lines that the job turns into progress.
export function proxyArgs(src: string, out: string): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-progress',
    'pipe:1',
    '-nostats',
    '-i',
    src,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    `scale=-2:${PROXY_HEIGHT}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-f',
    'mp4',
    out
  ]
}

// Reads one line of -progress output. Returns the fraction done, or undefined for other lines.
export function proxyProgressFromLine(line: string, durationSec: number): number | undefined {
  const match = /^out_time_ms=(\d+)/.exec(line.trim())
  if (!match || !(durationSec > 0)) return undefined
  const fraction = Number(match[1]) / 1_000_000 / durationSec
  return Math.min(1, Math.max(0, fraction))
}

// The file playback reads: the proxy when the user chose it and it is ready, otherwise the original.
// Export never calls this; it always uses the originals.
export function playbackSource(
  ref: Pick<MediaRef, 'useProxy'>,
  originalPath: string,
  proxyPath: string | null
): string {
  return ref.useProxy === true && proxyPath !== null ? proxyPath : originalPath
}
