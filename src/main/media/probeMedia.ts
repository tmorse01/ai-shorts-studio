// Runs ffprobe on one file and returns what it found. The child process is killed when the signal aborts.
import { spawn } from 'node:child_process'
import type { ProbeResult } from '@shared/media/probe'
import { UserFacingError } from '../errors'
import { parseProbeOutput } from './parseProbe'

export interface ProbeOptions {
  /** Full path to the ffprobe binary. */
  ffprobe: string
  signal?: AbortSignal
}

export async function probeMedia(path: string, options: ProbeOptions): Promise<ProbeResult> {
  const stdout = await runFfprobe(
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

// Arguments go in an array, never a shell string, so file names with spaces or quotes are safe.
function runFfprobe(bin: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, shell: false, signal })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.stderr.on('data', (chunk: string) => (stderr += chunk))
    // Also fires when the signal aborts; the queue checks the signal to tell cancel from failure.
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout)
      reject(
        new UserFacingError(
          'This file could not be read.',
          stderr.trim() || `ffprobe exited with code ${code}`
        )
      )
    })
  })
}
