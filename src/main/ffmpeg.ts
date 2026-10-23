import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import {
  cropRect,
  outputSize,
  remapCaptions,
  type Caption,
  type Framing,
  type Ratio,
  type TimelineCut,
  type Size
} from '../shared/timeline'
import type { ExportOptions } from '../shared/schemas'
import { qualityToCrf, shortSideFor } from '../shared/export-math'
import type { ProbeInfo } from '../shared/types'

/** Resolve a bundled binary in dev (resources/bin) and packaged builds (resources/bin next to app.asar). */
export function binPath(name: 'ffmpeg' | 'ffprobe'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'bin', exe)]
    : [join(app.getAppPath(), 'resources', 'bin', exe)]
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    throw new Error(`${exe} not found. Run "pnpm fetch:bin" to copy FFmpeg into resources/bin.`)
  }
  return found
}

export class ProcessCancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'ProcessCancelledError'
  }
}

export interface RunOptions {
  cwd?: string
  /** Called with each complete stdout line (used for -progress pipe:1). */
  onStdoutLine?: (line: string) => void
  /** Called with each complete stderr line. */
  onStderrLine?: (line: string) => void
  /** Receives the child so callers can kill it on cancel. */
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void
}

/**
 * Spawn a binary with an argv array (never a shell string). Resolves with the full stderr on
 * success; rejects with a useful message on non-zero exit.
 */
export function runProcess(bin: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true, shell: false })
    opts.onSpawn?.(child)
    let stderr = ''
    let stderrBuf = ''
    let stdoutBuf = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk
      let idx: number
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        opts.onStdoutLine?.(stdoutBuf.slice(0, idx).trimEnd())
        stdoutBuf = stdoutBuf.slice(idx + 1)
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      stderrBuf += chunk
      let idx: number
      while ((idx = stderrBuf.indexOf('\n')) >= 0) {
        opts.onStderrLine?.(stderrBuf.slice(0, idx).trimEnd())
        stderrBuf = stderrBuf.slice(idx + 1)
      }
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal) return reject(new ProcessCancelledError())
      if (code === 0) return resolve(stderr)
      const tail = stderr.trim().split('\n').slice(-8).join('\n')
      reject(new Error(`${bin.split(/[\\/]/).pop()} exited with code ${code}\n${tail}`))
    })
  })
}

const probeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional()
    })
  ),
  format: z.object({ duration: z.string().optional() })
})

/** Probe real streams with ffprobe rather than trusting the file extension. */
export async function probeMedia(path: string): Promise<ProbeInfo> {
  const out = await collectStdout(binPath('ffprobe'), [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    path
  ])
  const parsed = probeSchema.parse(JSON.parse(out))
  const video = parsed.streams.find((s) => s.codec_type === 'video')
  const hasAudio = parsed.streams.some((s) => s.codec_type === 'audio')
  // Audio-only files are valid library entries too. They report no picture: width, height and codec are zero.
  if (!video && !hasAudio) {
    throw new Error('No readable video or audio stream. Is this a supported file?')
  }
  if (video && (!video.width || !video.height)) {
    throw new Error('No readable video stream. Is this a supported MP4/MOV file?')
  }
  const durationSec = Number(parsed.format.duration ?? 0)
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('Could not read the duration; the file may be corrupt.')
  }
  return {
    durationSec,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    videoCodec: video ? (video.codec_name ?? 'unknown') : 'none',
    hasAudio
  }
}

function collectStdout(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, shell: false })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c: string) => (out += c))
    child.stderr.on('data', (c: string) => (err += c))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `${bin} exited with ${code}`))
    )
  })
}

export interface ExportInput {
  sourcePath: string
  probe: ProbeInfo
  segments: TimelineCut[]
  /** How long the short is. Blank space between cuts is filled with black and silence. */
  lengthSec: number
  captions: Caption[]
  ratio: Ratio
  framing: Framing
  captionsEnabled: boolean
  captionFontSize: number
  /** Music pieces to lay under the short. Each plays `lengthSec` from `trackStartSec` in its file, from `startSec` on the short. */
  music: { path: string; startSec: number; trackStartSec: number; lengthSec: number }[]
  musicVolume: number
  musicDuck: boolean
  /** Absolute path to a recorded narration file, or null. */
  narrationPath: string | null
  options: ExportOptions
}

export interface GraphPlan {
  args: string[]
  totalSec: number
  /** Output-timeline captions to write as captions.ass (empty when none apply). */
  captions: Caption[]
  outputSize: Size
}

/**
 * Build the ffmpeg argv for one short. Pure: no disk or process access, so the graph can be unit
 * tested. Inputs: 0 = source, then optional silence (no-audio sources), music, narration.
 */
/** One stretch of the output: a cut's footage, or blank space between cuts (shown as black with silence). */
export type TimelinePiece = { kind: 'cut'; seg: TimelineCut } | { kind: 'gap'; sec: number }

/** Split the timeline into cuts and the blank stretches between them, in order, filling the whole length. */
export function timelinePieces(cuts: TimelineCut[], lengthSec: number): TimelinePiece[] {
  const pieces: TimelinePiece[] = []
  let cursor = 0
  for (const c of [...cuts].sort((a, b) => a.atSec - b.atSec)) {
    if (c.atSec - cursor > 0.001) pieces.push({ kind: 'gap', sec: c.atSec - cursor })
    pieces.push({ kind: 'cut', seg: c })
    cursor = c.atSec + (c.endSec - c.startSec)
  }
  if (lengthSec - cursor > 0.001) pieces.push({ kind: 'gap', sec: lengthSec - cursor })
  return pieces
}

export function buildExportArgs(input: ExportInput, outPath: string): GraphPlan {
  const total = input.lengthSec
  const size = outputSize(
    input.ratio,
    { width: input.probe.width, height: input.probe.height },
    shortSideFor(input.options.resolution)
  )
  const args: string[] = ['-hide_banner', '-y', '-progress', 'pipe:1', '-nostats']
  const inputs: string[] = ['-i', input.sourcePath]
  let nextIndex = 1

  // Silence spans the whole source so its timestamps match the segment times we trim by.
  const silenceIndex = input.probe.hasAudio ? null : nextIndex++
  if (silenceIndex !== null) {
    inputs.push(
      '-f',
      'lavfi',
      '-t',
      input.probe.durationSec.toFixed(3),
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000'
    )
  }
  const musicIndexes = input.music.map((clip) => {
    inputs.push('-i', clip.path)
    return nextIndex++
  })
  const narrationIndex = input.narrationPath ? nextIndex++ : null
  if (input.narrationPath) {
    inputs.push('-i', input.narrationPath)
  }

  const chains: string[] = []
  const concatPairs: string[] = []
  const pieces = timelinePieces(input.segments, total)
  pieces.forEach((piece, i) => {
    if (piece.kind === 'cut') {
      const seg = piece.seg
      chains.push(
        `[0:v]trim=start=${seg.startSec.toFixed(3)}:end=${seg.endSec.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
      )
      const audioSrc = silenceIndex !== null ? `[${silenceIndex}:a]atrim=start=${seg.startSec.toFixed(3)}:end=${seg.endSec.toFixed(3)}` : `[0:a]atrim=start=${seg.startSec.toFixed(3)}:end=${seg.endSec.toFixed(3)}`
      chains.push(`${audioSrc},asetpts=PTS-STARTPTS[a${i}]`)
    } else {
      // Blank space: black picture and silence, at the source's frame size so the cuts can join it.
      const d = piece.sec.toFixed(3)
      chains.push(`color=c=black:s=${input.probe.width}x${input.probe.height}:r=30:d=${d},format=yuv420p,setsar=1[v${i}]`)
      chains.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${d}[a${i}]`)
    }
    concatPairs.push(`[v${i}][a${i}]`)
  })
  const n = pieces.length
  chains.push(`${concatPairs.join('')}concat=n=${n}:v=1:a=1[vc][ac]`)

  // Video: crop (or fit with pad) to the target size, then burn captions.
  const videoFilters: string[] = []
  const crop = cropRect({ width: input.probe.width, height: input.probe.height }, input.ratio, input.framing)
  if (crop) videoFilters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`)
  if (input.ratio !== 'original') {
    if (input.framing.mode === 'fit') {
      videoFilters.push(
        `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease`,
        `pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:black`
      )
    } else {
      videoFilters.push(`scale=${size.width}:${size.height}`)
    }
  }
  videoFilters.push('setsar=1')
  const captions = input.captionsEnabled ? remapCaptions(input.captions, input.segments) : []
  if (captions.length > 0) videoFilters.push('ass=captions.ass')
  chains.push(`[vc]${videoFilters.join(',')}[vout]`)

  // Audio: voice (source, plus optional narration) with music ducked under it.
  let voice = '[ac]'
  if (narrationIndex !== null) {
    chains.push(`[${narrationIndex}:a]aresample=48000,aformat=channel_layouts=stereo[nar]`)
    chains.push(`[ac][nar]amix=inputs=2:duration=first:normalize=0[voice]`)
    voice = '[voice]'
  }
  if (input.music.length > 0) {
    const volume = Math.max(0, Math.min(1, input.musicVolume)).toFixed(3)
    const fadeStart = Math.max(0, total - 1.5).toFixed(3)
    input.music.forEach((clip, i) => {
      const from = Math.max(0, clip.trackStartSec).toFixed(3)
      const to = (Math.max(0, clip.trackStartSec) + clip.lengthSec).toFixed(3)
      const delayMs = Math.round(Math.max(0, clip.startSec) * 1000)
      chains.push(
        `[${musicIndexes[i]}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,adelay=${delayMs}:all=1[mc${i}]`
      )
    })
    // Pieces are summed without normalising, so each keeps its level. Gaps between pieces are silent.
    const pieces = input.music.map((_, i) => `[mc${i}]`).join('')
    chains.push(
      input.music.length === 1
        ? `[mc0]anull[mix]`
        : `${pieces}amix=inputs=${input.music.length}:duration=longest:normalize=0[mix]`
    )
    chains.push(
      `[mix]atrim=start=0:end=${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=${volume},afade=t=out:st=${fadeStart}:d=1.5[mus]`
    )
    if (input.musicDuck) {
      chains.push(`${voice}asplit=2[vsc][vmix]`)
      chains.push(
        `[mus][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[mduck]`,
        `[vmix][mduck]amix=inputs=2:duration=first:normalize=0[aout]`
      )
    } else {
      chains.push(`${voice}[mus]amix=inputs=2:duration=first:normalize=0[aout]`)
    }
  } else {
    chains.push(`${voice}anull[aout]`)
  }

  args.push(...inputs)
  args.push('-filter_complex', chains.join(';'))
  args.push(
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-t',
    total.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(qualityToCrf(input.options.quality)),
    '-pix_fmt',
    'yuv420p'
  )
  if (input.options.fps !== 'source') args.push('-r', String(input.options.fps))
  args.push(
    '-c:a',
    'aac',
    '-b:a',
    `${input.options.audioKbps}k`,
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    outPath
  )
  return { args, totalSec: total, captions, outputSize: size }
}
