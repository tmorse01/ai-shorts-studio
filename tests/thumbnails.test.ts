import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(process.cwd()) }
}))

const { binPath, runProcess } = await import('../src/main/ffmpeg')
const { MAX_THUMBNAILS, buildThumbArgs, thumbFileName, thumbnailStep, thumbsReady, writeThumbMeta } =
  await import('../src/main/thumbnails')

describe('thumbnail planning', () => {
  it('spaces thumbnails at least one second apart and never more than the cap', () => {
    expect(thumbnailStep(30)).toBe(1)
    const long = thumbnailStep(3 * 3600)
    expect(Math.ceil((3 * 3600) / long)).toBeLessThanOrEqual(MAX_THUMBNAILS)
  })

  it('names thumbnails 1-based on disk so index N maps to the Nth frame', () => {
    expect(thumbFileName(0)).toBe('thumb-0001.jpg')
    expect(thumbFileName(119)).toBe('thumb-0120.jpg')
  })

  it('only counts thumbnails as ready when metadata and every image exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thumb-ready-'))
    expect(thumbsReady(dir)).toBeNull()
    writeThumbMeta(dir, { stepSec: 5, count: 2 })
    expect(thumbsReady(dir)).toBeNull()
    writeFileSync(join(dir, thumbFileName(0)), 'x')
    writeFileSync(join(dir, thumbFileName(1)), 'x')
    expect(thumbsReady(dir)).toEqual({ stepSec: 5, count: 2 })
  })
})

describe('real thumbnail generation', () => {
  it('writes one frame per step from a real video in a single pass', () => {
    const work = mkdtempSync(join(tmpdir(), 'thumb-real-'))
    const source = join(work, 'src.mp4')
    execFileSync(
      binPath('ffmpeg'),
      ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', source],
      { stdio: 'pipe' }
    )
    const out = join(work, 'thumbs')
    mkdirSync(out, { recursive: true })
    return runProcess(binPath('ffmpeg'), buildThumbArgs(source, out, 5)).then(() => {
      const files = readdirSync(out).filter((f) => f.startsWith('thumb-') && f.endsWith('.jpg'))
      expect(files.length).toBeGreaterThanOrEqual(4)
      expect(existsSync(join(out, thumbFileName(0)))).toBe(true)
    })
  }, 120_000)
})
