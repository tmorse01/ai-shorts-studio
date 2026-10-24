// Runs ffprobe on one file and returns what it found. The child process is killed when the signal aborts.
import type { ProbeResult } from '@shared/media/probe'
import { UserFacingError } from '../errors'
import { parseProbeOutput } from './parseProbe'
import { runTool } from './runTool'

export interface ProbeOptions {
  /** Full path to the ffprobe binary. */
  ffprobe: string
  signal?: AbortSignal
}

export async function probeMedia(path: string, options: ProbeOptions): Promise<ProbeResult> {
  const stdout = await runTool(
    options.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
    options.signal
  )
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    throw new UserFacingError('ffprobe returned an unreadable answer for this file.')
  }
  return parseProbeOutput(json)
}
