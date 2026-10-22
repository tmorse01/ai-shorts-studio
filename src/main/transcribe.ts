import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { app } from 'electron'
import { z } from 'zod'
import { binPath, runProcess } from './ffmpeg'
import type { Caption, Segment } from '../shared/timeline'
import type { CandidateWindow } from './ai'

export interface TranscriptSegment {
  startSec: number
  endSec: number
  text: string
}

const whisperJsonSchema = z.object({
  transcription: z.array(
    z.object({
      offsets: z.object({ from: z.number(), to: z.number() }),
      text: z.string()
    })
  )
})

/** Parse whisper.cpp `-oj` output. Blank and whitespace-only segments are dropped. */
export function parseWhisperJson(raw: string): TranscriptSegment[] {
  const parsed = whisperJsonSchema.parse(JSON.parse(raw))
  return parsed.transcription
    .map((t) => ({
      startSec: t.offsets.from / 1000,
      endSec: t.offsets.to / 1000,
      text: t.text.replace(/\s+/g, ' ').trim()
    }))
    .filter((t) => t.text.length > 0 && t.endSec > t.startSec)
}

/** Resolve the bundled whisper.cpp CLI and model, or null when they are not present. */
export function whisperFiles(): { cli: string; model: string } | null {
  const dir = app.isPackaged
    ? join(process.resourcesPath, 'whisper')
    : join(app.getAppPath(), 'resources', 'whisper')
  const cli = join(dir, 'whisper-cli.exe')
  const model = join(dir, 'ggml-base.en.bin')
  return existsSync(cli) && existsSync(model) ? { cli, model } : null
}

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

/**
 * Transcribe the source's speech. Audio is extracted to 16 kHz mono WAV in the scratch folder, run
 * through whisper.cpp, and the result is cached per project so re-analysis does not re-transcribe.
 */
export async function transcribeSource(opts: {
  sourcePath: string
  cacheFile: string
  scratchDir: string
  onSpawn: (child: ChildProcessWithoutNullStreams) => void
}): Promise<TranscriptSegment[]> {
  if (existsSync(opts.cacheFile)) {
    return parseWhisperJson(readFileSync(opts.cacheFile, 'utf8'))
  }
  const files = whisperFiles()
  if (!files) throw new Error('Speech-to-text is not bundled in this build.')

  mkdirSync(opts.scratchDir, { recursive: true })
  const wav = join(opts.scratchDir, 'speech-16k.wav')
  const outBase = join(opts.scratchDir, 'transcript')
  try {
    await runProcess(
      binPath('ffmpeg'),
      ['-hide_banner', '-nostats', '-y', '-i', opts.sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav],
      { onSpawn: opts.onSpawn }
    )
    await runProcess(
      files.cli,
      ['-m', files.model, '-f', wav, '-l', 'en', '-oj', '-of', outBase, '-np'],
      { onSpawn: opts.onSpawn }
    )
    const raw = readFileSync(`${outBase}.json`, 'utf8')
    const segments = parseWhisperJson(raw)
    mkdirSync(join(opts.cacheFile, '..'), { recursive: true })
    writeFileSync(opts.cacheFile, raw, 'utf8')
    return segments
  } finally {
    rmSync(opts.scratchDir, { recursive: true, force: true })
  }
}
