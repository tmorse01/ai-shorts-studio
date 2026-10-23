import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { app } from 'electron'
import { binPath, runProcess } from './ffmpeg'
import type { Caption, Segment } from '../shared/timeline'
import type { CandidateWindow } from './ai'

export interface TranscriptSegment {
  startSec: number
  endSec: number
  text: string
}

/** Parakeet TDT 0.6B v3 (Q8_0 GGUF). Built and placed in resources/parakeet by scripts/fetch-binaries.mjs. */
export const PARAKEET_MODEL_FILE = 'ggml-parakeet-tdt-0.6b-v3-q8_0.bin'
const PARAKEET_THREADS = 8

/** Resolve the bundled Parakeet CLI and model, or null when either is missing. */
export function parakeetFiles(): { cli: string; model: string } | null {
  const dir = app.isPackaged
    ? join(process.resourcesPath, 'parakeet')
    : join(app.getAppPath(), 'resources', 'parakeet')
  const cli = join(dir, 'parakeet-cli.exe')
  const model = join(dir, PARAKEET_MODEL_FILE)
  return existsSync(cli) && existsSync(model) ? { cli, model } : null
}

/**
 * One `parakeet-cli -ps` token line, e.g.
 * `  [ 0] id= 4285 frame= 2 ... t0=  16 t1=  24 word_start=true "▁Go"`.
 */
const PARAKEET_TOKEN = /^\s*\[\s*\d+\] id=\s*\d+ .*? t0=\s*(\d+)\s+t1=\s*(\d+)\s+word_start=(true|false) "(.*)"$/

/**
 * parakeet-cli prints token times in 10 ms units (t0 = 328 is 3.28 s). Its `Segment` line uses another
 * unit and covers the whole file in one piece, so segments are rebuilt from the tokens instead.
 */
const PARAKEET_UNIT_SEC = 0.01
const PAUSE_SPLIT_SEC = 0.8
const MAX_SEGMENT_SEC = 12

/**
 * Parse parakeet-cli stderr (the transcript is written there) into speech segments. Tokens are merged
 * into words, then words are grouped into segments split at pauses and at MAX_SEGMENT_SEC.
 */
export function parseParakeetOutput(stderr: string): TranscriptSegment[] {
  const words: TranscriptSegment[] = []
  for (const line of stderr.split('\n')) {
    const m = PARAKEET_TOKEN.exec(line.trimEnd())
    if (!m) continue
    const startSec = Number(m[1]) * PARAKEET_UNIT_SEC
    const endSec = Number(m[2]) * PARAKEET_UNIT_SEC
    const piece = m[4].replace(/▁/g, '')
    const last = words[words.length - 1]
    if (m[3] === 'true' || !last) {
      words.push({ startSec, endSec, text: piece })
    } else {
      last.text += piece
      last.endSec = endSec
    }
  }

  const segments: TranscriptSegment[] = []
  let current: TranscriptSegment | null = null
  for (const w of words) {
    const text = w.text.trim()
    if (text.length === 0) continue
    const startsNew =
      !current || w.startSec - current.endSec >= PAUSE_SPLIT_SEC || w.endSec - current.startSec > MAX_SEGMENT_SEC
    if (current && startsNew) segments.push(current)
    if (startsNew) current = { startSec: w.startSec, endSec: w.endSec, text }
    else if (current) {
      current.text = `${current.text} ${text}`
      current.endSec = w.endSec
    }
  }
  if (current) segments.push(current)
  return segments.map((s) => ({ ...s, startSec: round2(s.startSec), endSec: round2(s.endSec) }))
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Text for each candidate window: the transcript lines that overlap it. Keeps the prompt bounded
 * by stopping once `maxChars` is reached, so long transcripts cannot blow up the request size.
 */
export function transcriptForWindows(segments: TranscriptSegment[], windows: CandidateWindow[], maxChars = 8000): string {
  const lines: string[] = []
  let used = 0
  for (const w of windows) {
    const inWindow = segments.filter((s) => s.endSec > w.startSec && s.startSec < w.endSec)
    if (inWindow.length === 0) continue
    const text = inWindow.map((s) => `${s.startSec.toFixed(1)}s: ${s.text}`).join(' | ')
    const line = `Window #${w.index} (${w.startSec.toFixed(1)}s–${w.endSec.toFixed(1)}s): ${text}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length
  }
  return lines.join('\n')
}

/**
 * Captions for a short, in source time. Each transcript segment is clipped to the kept cuts, so
 * captions never show speech that is not in the short.
 */
export function captionsForSegments(segments: TranscriptSegment[], kept: Segment[]): Caption[] {
  const out: Caption[] = []
  for (const cut of kept) {
    for (const s of segments) {
      const start = Math.max(s.startSec, cut.startSec)
      const end = Math.min(s.endSec, cut.endSec)
      if (end - start < 0.2) continue
      out.push({ startSec: round3(start), endSec: round3(end), text: s.text })
    }
  }
  return out.sort((a, b) => a.startSec - b.startSec)
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** Cache entry. `engine` records which model produced the segments, so a model change is visible on disk. */
interface CachedTranscript {
  engine: 'parakeet'
  segments: TranscriptSegment[]
}

/** Cached segments, or null when the file is missing or unreadable. */
function readTranscriptCache(file: string): TranscriptSegment[] | null {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CachedTranscript>
    return Array.isArray(parsed.segments) ? parsed.segments : null
  } catch {
    return null
  }
}

/**
 * Transcribe the source's speech. Audio is extracted to 16 kHz mono WAV in the scratch folder, then
 * Parakeet transcribes it. The result is cached per project so re-analysis does not re-transcribe.
 */
export async function transcribeSource(opts: {
  sourcePath: string
  cacheFile: string
  scratchDir: string
  onSpawn: (child: ChildProcessWithoutNullStreams) => void
}): Promise<TranscriptSegment[]> {
  const cached = readTranscriptCache(opts.cacheFile)
  if (cached) return cached

  const parakeet = parakeetFiles()
  if (!parakeet) throw new Error('Speech-to-text is not bundled in this build. Run pnpm fetch:bin.')

  mkdirSync(opts.scratchDir, { recursive: true })
  const wav = join(opts.scratchDir, 'speech-16k.wav')
  try {
    await runProcess(
      binPath('ffmpeg'),
      ['-hide_banner', '-nostats', '-y', '-i', opts.sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav],
      { onSpawn: opts.onSpawn }
    )
    // The transcript is written to stderr, which runProcess returns.
    const stderr = await runProcess(
      parakeet.cli,
      ['-m', parakeet.model, '-f', wav, '-ps', '-t', String(PARAKEET_THREADS)],
      { onSpawn: opts.onSpawn }
    )
    const segments = parseParakeetOutput(stderr)
    mkdirSync(join(opts.cacheFile, '..'), { recursive: true })
    const entry: CachedTranscript = { engine: 'parakeet', segments }
    writeFileSync(opts.cacheFile, JSON.stringify(entry), 'utf8')
    return segments
  } finally {
    rmSync(opts.scratchDir, { recursive: true, force: true })
  }
}
