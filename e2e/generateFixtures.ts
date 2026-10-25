// Generates the media the specs import, with FFmpeg, at setup. Files are cached in e2e/.fixtures/ and
// never committed. Delete that folder to regenerate them.
import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const FIXTURE_DIR = resolve(__dirname, '.fixtures')
export const FIXTURES = {
  /** 30 s, 1920x1080 test pattern, timecode burned in, 440 Hz tone. */
  clipA: join(FIXTURE_DIR, 'clip-a.mp4'),
  /** 20 s, 1920x1080 test pattern, timecode burned in, 880 Hz tone. */
  clipB: join(FIXTURE_DIR, 'clip-b.mp4'),
  /** 60 s audio-only music track. */
  music: join(FIXTURE_DIR, 'music.m4a'),
  /** 2 s audio-only music, short enough that Loop to fill repeats it inside a short. */
  musicShort: join(FIXTURE_DIR, 'music-short.m4a'),
  /** 3 s, 330 Hz tone as a 16-bit WAV, imported as narration. */
  narrationWav: join(FIXTURE_DIR, 'narration.wav'),
  /** One still image. */
  still: join(FIXTURE_DIR, 'still.png')
} as const

// drawtext needs a font file. The generator copies Arial into the cache folder and runs FFmpeg there,
// so the font is a plain relative name. A drive letter in the filter would need escaping.
const FONT_NAME = 'arial.ttf'
// FFmpeg filter syntax escapes a colon with a backslash. Built from a char code to keep it readable.
const BACKSLASH = String.fromCharCode(92)
const TIMECODE =
  'drawtext=fontfile=' +
  FONT_NAME +
  ":text='%{pts" +
  BACKSLASH +
  ":hms}':x=40:y=40:fontsize=96:fontcolor=white:box=1:boxcolor=black@0.5"

/** The FFmpeg binary: FFMPEG_PATH, then the bundled copy in resources/bin, then PATH. */
export function ffmpegCommand(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  const bundled = resolve(__dirname, '..', 'resources', 'bin', 'ffmpeg.exe')
  return existsSync(bundled) ? bundled : 'ffmpeg'
}

function videoClip(
  output: string,
  seconds: number,
  tone: number,
  pattern: 'testsrc2' | 'testsrc'
): string[] {
  return [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `${pattern}=size=1920x1080:rate=30:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${tone}:duration=${seconds}`,
    '-vf',
    TIMECODE,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    output
  ]
}

const COMMANDS: Record<keyof typeof FIXTURES, string[]> = {
  clipA: videoClip(FIXTURES.clipA, 30, 440, 'testsrc2'),
  clipB: videoClip(FIXTURES.clipB, 20, 880, 'testsrc'),
  music: [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:duration=60',
    '-c:a',
    'aac',
    FIXTURES.music
  ],
  musicShort: [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:duration=2',
    '-c:a',
    'aac',
    FIXTURES.musicShort
  ],
  narrationWav: [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:duration=3',
    '-c:a',
    'pcm_s16le',
    FIXTURES.narrationWav
  ],
  still: ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360', '-frames:v', '1', FIXTURES.still]
}

/** Arial from the Windows fonts folder, the font the timecode is drawn with. */
function systemFont(): string {
  return join(process.env.WINDIR ?? 'C:/Windows', 'Fonts', 'arial.ttf')
}

/** Makes any fixture that is not cached yet. Resolves the full map of paths. */
export async function generateFixtures(): Promise<typeof FIXTURES> {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const font = join(FIXTURE_DIR, FONT_NAME)
  if (!existsSync(font)) copyFileSync(systemFont(), font)
  for (const key of Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]) {
    if (existsSync(FIXTURES[key])) continue
    await run(ffmpegCommand(), ['-hide_banner', '-loglevel', 'error', ...COMMANDS[key]], {
      cwd: FIXTURE_DIR,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    })
  }
  return FIXTURES
}
