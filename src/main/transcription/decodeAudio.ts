// Reads a media file's first audio track as 16 kHz mono float samples, which is what the speech model
// takes. FFmpeg writes raw float PCM to stdout; the bytes are collected as binary, never as text.
import { spawn } from 'node:child_process'
import { UserFacingError } from '../errors'
import { SPEECH_SAMPLE_RATE } from './speechEngine'

export function audioDecodeArgs(src: string): string[] {
  return [
    '-hide_banner',
    '-v',
    'error',
    '-i',
    src,
    '-vn',
    '-map',
    '0:a:0',
    '-ac',
    '1',
    '-ar',
    String(SPEECH_SAMPLE_RATE),
    '-f',
    'f32le',
    '-'
  ]
}

/** Decodes the audio to float samples. Returns null when the file has no audio track. */
export async function decodeAudioSamples(
  path: string,
  hasAudio: boolean,
  ffmpeg: string,
  signal?: AbortSignal
): Promise<Float32Array | null> {
  if (!hasAudio) return null
  const bytes = await runForBytes(ffmpeg, audioDecodeArgs(path), signal)
  return bytesToSamples(bytes)
}

/** Reads little-endian 32-bit floats. The bytes are copied so the array is always aligned. */
export function bytesToSamples(bytes: Uint8Array): Float32Array {
  const aligned = new Uint8Array(bytes.byteLength - (bytes.byteLength % 4))
  aligned.set(bytes.subarray(0, aligned.byteLength))
  return new Float32Array(aligned.buffer)
}

function runForBytes(bin: string, args: readonly string[], signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, shell: false, signal })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks))
      reject(
        new UserFacingError(
          'The audio in this file could not be read.',
          stderr.trim() || `${bin} exited with code ${code}`
        )
      )
    })
  })
}
