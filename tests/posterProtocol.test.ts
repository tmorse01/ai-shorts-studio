import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePosterUrl, posterUrl } from '@shared/media/posterSource'
import { serveMediaRequest } from '../src/main/media/mediaProtocol'
import { MediaSourceRegistry } from '../src/main/media/mediaSources'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

// A project folder with one rendered poster frame for short1.
function projectWithPoster(prefix: string, bytes: Buffer): string {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  const dir = join(folder, 'cache', 'posters', 'short1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'vid1-2000.jpg'), bytes)
  return folder
}

describe('poster URLs', () => {
  it('names the short and cache file, and the version is ignored when parsing', () => {
    expect(parsePosterUrl('aism-media://poster/short1/vid1-2000.jpg')).toEqual({
      shortId: 'short1',
      fileName: 'vid1-2000.jpg'
    })
    expect(parsePosterUrl(posterUrl('short1', 'vid1-2000.jpg', 42))).toEqual({
      shortId: 'short1',
      fileName: 'vid1-2000.jpg'
    })
  })

  it('refuses traversal, extra segments and file names that are not poster frames', () => {
    expect(parsePosterUrl('aism-media://poster/../secret.jpg')).toBeNull()
    expect(parsePosterUrl('aism-media://poster/short1/../vid1-2000.jpg')).toBeNull()
    expect(parsePosterUrl('aism-media://poster/short1/a/vid1-2000.jpg')).toBeNull()
    expect(parsePosterUrl('aism-media://poster/short1/vid1.png')).toBeNull()
    expect(parsePosterUrl('aism-media://media/vid1/original')).toBeNull()
  })

  it('changes the URL when the frame file changes or the version is bumped', () => {
    const first = posterUrl('short1', 'vid1-2000.jpg', 1)
    expect(posterUrl('short1', 'vid1-5000.jpg', 1)).not.toBe(first)
    expect(posterUrl('short1', 'vid1-2000.jpg', 2)).not.toBe(first)
  })
})

describe('serveMediaRequest for posters', () => {
  it('serves a rendered poster frame as a JPEG', async () => {
    const folder = projectWithPoster('poster-protocol-', JPEG)
    const registry = new MediaSourceRegistry()
    registry.setPosterFolder('short1', folder)

    const response = await serveMediaRequest(
      new Request(posterUrl('short1', 'vid1-2000.jpg', 7)),
      registry
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG)
  })

  it('returns 404 for an unknown short, a missing frame or an empty file', async () => {
    const folder = projectWithPoster('poster-protocol-miss-', Buffer.alloc(0))
    const registry = new MediaSourceRegistry()
    expect(
      (await serveMediaRequest(new Request(posterUrl('short1', 'vid1-2000.jpg')), registry)).status
    ).toBe(404)

    registry.setPosterFolder('short1', folder)
    expect(
      (await serveMediaRequest(new Request(posterUrl('short1', 'vid1-2000.jpg')), registry)).status
    ).toBe(404)
    expect(
      (await serveMediaRequest(new Request(posterUrl('short1', 'vid1-9999.jpg')), registry)).status
    ).toBe(404)
  })
})
