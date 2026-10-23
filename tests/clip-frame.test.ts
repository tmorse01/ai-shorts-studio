import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../src/shared/types'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(process.cwd()) }
}))

const { binPath } = await import('../src/main/ffmpeg')
const { clipFrameFile, clipFrameTimeSec, renderClipFrame } = await import('../src/main/poster')

const probe = { durationSec: 6, width: 320, height: 180, videoCodec: 'h264', hasAudio: false }

let work: string
let userData: string
let source: string

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'clip-frame-'))
  userData = join(work, 'userdata')
  source = join(work, 'src.mp4')
  execFileSync(
    binPath('ffmpeg'),
    ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source],
    { stdio: 'pipe' }
  )
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

const asset = (path: string, videoCodec = 'h264'): MediaAsset => ({
  id: 'asset-1',
  name: 'src.mp4',
  kind: 'source',
  path,
  probe: { ...probe, videoCodec },
  proxyPath: null,
  createdAt: '2026-01-01T00:00:00.000Z'
})

describe('clip frame time', () => {
  it('is the start of the first cut, or zero for a clip with no cuts', () => {
    const cuts = [
      { startSec: 2.5, endSec: 4 },
      { startSec: 5, endSec: 6 }
    ]
    expect(clipFrameTimeSec(cuts)).toBe(2.5)
    expect(clipFrameTimeSec([])).toBe(0)
  })
})

describe('rendering a clip frame', () => {
  it('writes a JPEG from the clip source at the first cut, under the clip id', async () => {
    const short = { id: 'short-1', projectId: 'proj-1', segments: [{ startSec: 2, endSec: 4 }] }
    const ok = await renderClipFrame(userData, short, asset(source))
    expect(ok).toBe(true)
    expect(existsSync(clipFrameFile(userData, 'proj-1', 'short-1', 'card'))).toBe(true)
    expect(existsSync(clipFrameFile(userData, 'proj-1', 'short-1', 'preview'))).toBe(true)
  }, 120_000)

  it('replaces the frame when the clip is rendered again', async () => {
    const short = { id: 'short-2', projectId: 'proj-1', segments: [{ startSec: 1, endSec: 3 }] }
    await renderClipFrame(userData, short, asset(source))
    const again = await renderClipFrame(userData, { ...short, segments: [{ startSec: 3, endSec: 5 }] }, asset(source))
    expect(again).toBe(true)
    expect(existsSync(clipFrameFile(userData, 'proj-1', 'short-2', 'card'))).toBe(true)
  }, 120_000)

  it('renders nothing for a clip with no source, audio-only source, or no cuts', async () => {
    const withCut = { id: 'short-3', projectId: 'proj-1', segments: [{ startSec: 1, endSec: 3 }] }
    expect(await renderClipFrame(userData, withCut, null)).toBe(false)
    expect(await renderClipFrame(userData, withCut, asset(source, 'none'))).toBe(false)
    expect(await renderClipFrame(userData, { ...withCut, segments: [] }, asset(source))).toBe(false)
    expect(existsSync(clipFrameFile(userData, 'proj-1', 'short-3', 'card'))).toBe(false)
  })
})
