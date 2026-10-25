// Spec 18.07: export. A 10 s short with two clips, a crossfade, a text clip, captions and music is
// exported from the export screen with real FFmpeg. The output is checked with ffprobe and by reading
// frames. The project is written to disk before the app opens it, so the short is ready to export.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { createProfileDir, launchApp, type AppSession } from './launchApp'
import { FIXTURES, ffmpegCommand } from './generateFixtures'
import { IDENTITY_TRANSFORM } from '../src/shared/timeline/timeline'
import { CURRENT_SCHEMA_VERSION } from '../src/shared/project/schema'

const run = promisify(execFile)
const PROJECT_NAME = 'Export project'
const SHORT_NAME = 'Export short'
const SHORT_SECONDS = 10
const WIDTH = 1080
const HEIGHT = 1920

/** Writes a project folder with one 10 s short, and lists it in the profile's recent projects. */
async function seedProject(profileDir: string): Promise<string> {
  const folder = join(profileDir, 'Projects', PROJECT_NAME)
  await mkdir(join(folder, 'exports'), { recursive: true })
  await mkdir(join(folder, 'cache'), { recursive: true })
  const now = new Date().toISOString()
  const media = (id: string, path: string, kind: 'video' | 'audio', durationMs: number) => ({
    id,
    path,
    pathKind: 'absolute',
    fileName: path.split(/[\\/]/).pop() ?? id,
    sizeBytes: 1,
    durationMs,
    kind
  })
  const clip = (
    id: string,
    fields: { mediaId?: string; startMs: number; durationMs: number; sourceInMs: number }
  ) => ({ id, transform: IDENTITY_TRANSFORM, ...fields })
  const short = {
    id: 'short-1',
    name: SHORT_NAME,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    order: 0,
    targetLength: { minSec: 5, maxSec: 30 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: {
      tracks: [
        {
          id: 'track-main',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            clip('clip-1', { mediaId: 'media-a', startMs: 0, durationMs: 5000, sourceInMs: 2000 }),
            clip('clip-2', { mediaId: 'media-b', startMs: 5000, durationMs: 5000, sourceInMs: 0 })
          ]
        },
        {
          id: 'track-text',
          kind: 'text',
          role: 'text',
          muted: false,
          clips: [
            {
              ...clip('text-1', { startMs: 6000, durationMs: 3000, sourceInMs: 0 }),
              text: 'Hook',
              textItem: { text: 'Hook', styleId: 'heading', x: 0.5, y: 0.2, scale: 1 }
            }
          ]
        },
        {
          id: 'track-captions',
          kind: 'text',
          role: 'captions',
          muted: false,
          clips: [],
          captions: [
            {
              id: 'caption-1',
              words: [
                { text: 'Hello', startMs: 500, endMs: 1200 },
                { text: 'there', startMs: 1200, endMs: 2000 }
              ]
            }
          ]
        },
        {
          id: 'track-music',
          kind: 'audio',
          role: 'music',
          muted: false,
          clips: [
            clip('music-1', {
              mediaId: 'media-music',
              startMs: 0,
              durationMs: SHORT_SECONDS * 1000,
              sourceInMs: 0
            })
          ]
        }
      ],
      transitions: [
        {
          id: 'transition-1',
          fromClipId: 'clip-1',
          toClipId: 'clip-2',
          durationMs: 500,
          kind: 'crossfade'
        }
      ]
    }
  }
  const project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomUUID(),
    name: PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    media: [
      media('media-a', FIXTURES.clipA, 'video', 30_000),
      media('media-b', FIXTURES.clipB, 'video', 20_000),
      media('media-music', FIXTURES.music, 'audio', 60_000)
    ],
    mediaTags: [],
    moments: [],
    defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
    shorts: [short],
    scripts: []
  }
  await writeFile(join(folder, 'project.json'), JSON.stringify(project, null, 2), 'utf8')
  const recent = [{ folderPath: folder, name: PROJECT_NAME, lastOpened: now, shortCount: 1 }]
  await writeFile(join(profileDir, 'recent-projects.json'), JSON.stringify(recent), 'utf8')
  return folder
}

/** Launches the app on the seeded profile and opens the short's editor. */
async function openSeededShort(profileDir: string): Promise<AppSession> {
  const session = await launchApp({ profileDir })
  await session.page.getByText(PROJECT_NAME, { exact: true }).first().click()
  await expect(session.page.getByTestId('project-home')).toBeVisible()
  await session.openShort(SHORT_NAME)
  await expect(session.page.getByRole('navigation', { name: 'Editor tools' })).toBeVisible()
  return session
}

async function exportedFile(folder: string): Promise<string> {
  const files = (await readdir(join(folder, 'exports'))).filter((name) => name.endsWith('.mp4'))
  expect(files).toHaveLength(1)
  return join(folder, 'exports', files[0] ?? '')
}

interface ProbeOutput {
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[]
  format: { duration: string }
}

async function ffprobe(file: string): Promise<ProbeOutput> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    file
  ])
  return JSON.parse(stdout) as ProbeOutput
}

/** Waits until the render queue shows the export as Exported. Reports whether progress was seen. */
async function waitForRender(session: AppSession): Promise<{ sawProgress: boolean }> {
  const queue = session.page.getByLabel('Render queue')
  await expect(queue).toBeVisible()
  let sawProgress = false
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const text = await queue.innerText().catch(() => '')
    if (/Exporting/.test(text) || (await queue.getByRole('progressbar').count()) > 0) {
      sawProgress = true
    }
    if (/Exported/.test(text)) return { sawProgress }
    if (/Failed/.test(text)) throw new Error(`The export failed. Queue: ${text}`)
    await session.page.waitForTimeout(100)
  }
  throw new Error('The export did not finish within 120 seconds.')
}

async function readShortStatus(folder: string): Promise<string | undefined> {
  const project = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8')) as {
    shorts: { status: string }[]
  }
  return project.shorts[0]?.status
}

/** The peak level of the file's audio in dB, from FFmpeg's volumedetect. */
async function peakDb(file: string): Promise<number> {
  const { stderr } = await run(ffmpegCommand(), [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-vn',
    '-f',
    'null',
    '-'
  ])
  const match = /max_volume: (-?[\d.]+) dB/.exec(stderr)
  if (!match) throw new Error('volumedetect printed no max_volume line.')
  return Number(match[1])
}

/** The decoded RGB frame at `seconds`, as raw bytes. */
function frameAt(file: string, seconds: number): Promise<Buffer> {
  const args = [
    '-v',
    'error',
    '-ss',
    String(seconds),
    '-i',
    file,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1'
  ]
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      args,
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    )
  })
}

/** Near-white pixels in the lower part of the frame, where captions are drawn. */
function captionBandWhite(rgb: Buffer): number {
  let count = 0
  const top = Math.floor(HEIGHT * 0.6)
  const bottom = Math.floor(HEIGHT * 0.95)
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const row = Math.floor(pixel / WIDTH)
    if (row < top || row > bottom) continue
    const i = pixel * 3
    if (rgb[i] >= 235 && rgb[i + 1] >= 235 && rgb[i + 2] >= 235) count += 1
  }
  return count
}

/** Starts an export from the export screen, waits for it, and returns the output file and progress seen. */
async function exportFromScreen(
  session: AppSession,
  folder: string
): Promise<{ file: string; sawProgress: boolean }> {
  await session.page.getByRole('button', { name: 'Export', exact: true }).first().click()
  await session.page.getByRole('button', { name: 'Export video' }).click()
  const { sawProgress } = await waitForRender(session)
  return { file: await exportedFile(folder), sawProgress }
}

test('exports a 10s short with captions, text, a transition and music', async () => {
  const profileDir = await createProfileDir()
  const folder = await seedProject(profileDir)
  const session = await openSeededShort(profileDir)
  try {
    await session.app.evaluate(({ shell }) => {
      const state = globalThis as unknown as { revealed?: string[] }
      state.revealed = []
      shell.showItemInFolder = (path: string) => {
        state.revealed?.push(path)
      }
    })
    const { file, sawProgress } = await exportFromScreen(session, folder)
    expect(sawProgress).toBe(true)

    const probe = await ffprobe(file)
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    expect(video).toMatchObject({ codec_name: 'h264', width: WIDTH, height: HEIGHT })
    expect(audio?.codec_name).toBe('aac')
    expect(Math.abs(Number(probe.format.duration) - SHORT_SECONDS)).toBeLessThanOrEqual(0.1)
    expect(await peakDb(file)).toBeGreaterThan(-60)

    // Captions run from 0.5 s to 2.0 s: the caption band has text at 1.0 s and none at 3.0 s.
    const withCaption = captionBandWhite(await frameAt(file, 1))
    const withoutCaption = captionBandWhite(await frameAt(file, 3))
    expect(withCaption).toBeGreaterThan(500)
    expect(withoutCaption).toBeLessThan(50)

    await session.page.getByRole('button', { name: 'Open folder' }).first().click()
    await expect
      .poll(() =>
        session.app.evaluate(
          () => (globalThis as unknown as { revealed?: string[] }).revealed ?? []
        )
      )
      .toEqual([file])

    await expect.poll(() => readShortStatus(folder)).toBe('exported')
    await expect(session.page.getByLabel('Render queue').getByText('Exported')).toBeVisible()
  } finally {
    await session.close()
  }
})

test('the x264 fallback still produces a file when the hardware encoder fails', async () => {
  const profileDir = await createProfileDir()
  const folder = await seedProject(profileDir)
  process.env.AISS_E2E_FAIL_HW_ENCODER = '1'
  let session: AppSession | undefined
  try {
    session = await openSeededShort(profileDir)
    const { file } = await exportFromScreen(session, folder)
    const probe = await ffprobe(file)
    expect(probe.streams.find((stream) => stream.codec_type === 'video')).toMatchObject({
      codec_name: 'h264',
      width: WIDTH,
      height: HEIGHT
    })
    await expect.poll(() => readShortStatus(folder)).toBe('exported')
  } finally {
    delete process.env.AISS_E2E_FAIL_HW_ENCODER
    await session?.close()
  }
})
