// Runs an FFmpeg or FFprobe binary and returns its stdout. The child process is killed when the signal
// aborts. Arguments go in an array, never a shell string, so file names with spaces or quotes are safe.
import { spawn } from 'node:child_process'
import { UserFacingError } from '../errors'

export function runTool(
  bin: string,
  args: readonly string[],
  signal?: AbortSignal,
  // Sees each stdout chunk as it arrives, for long jobs that report progress there.
  onStdout?: (chunk: string) => void,
  // Sees each stderr chunk as it arrives. Filters such as showinfo print their results there.
  onStderr?: (chunk: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, shell: false, signal })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      onStdout?.(chunk)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      onStderr?.(chunk)
    })
    // Also fires when the signal aborts; the queue checks the signal to tell cancel from failure.
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout)
      reject(
        new UserFacingError(
          'This file could not be read.',
          stderr.trim() || `${bin} exited with code ${code}`
        )
      )
    })
  })
}
