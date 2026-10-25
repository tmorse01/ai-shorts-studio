import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mediaUrl } from '@shared/media/previewSource'
import { parseByteRange, serveMediaRequest } from '../src/main/media/mediaProtocol'
import { MediaSourceRegistry } from '../src/main/media/mediaSources'

describe('parseByteRange', () => {
  it('reads closed, open-ended and suffix ranges', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
    expect(parseByteRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('serves the whole file without a range, and flags ranges outside the file', () => {
    expect(parseByteRange(null, 1000)).toBeNull()
    expect(parseByteRange('bytes=-', 1000)).toBeNull()
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=5-2', 1000)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=0-1', 0)).toBe('unsatisfiable')
  })
})

describe('serveMediaRequest', () => {
  const folder = mkdtempSync(join(tmpdir(), 'media-protocol-'))
  const file = join(folder, 'clip.mp4')
  writeFileSync(file, '0123456789')
  const registry = new MediaSourceRegistry()
  registry.set('clip', { original: file, proxy: null })

  it('serves the original with its size and content type', async () => {
    const response = await serveMediaRequest(new Request(mediaUrl('clip', 'original')), registry)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('Content-Length')).toBe('10')
    expect(await response.text()).toBe('0123456789')
  })

  it('answers a byte range with 206 and the matching bytes', async () => {
    const response = await serveMediaRequest(
      new Request(mediaUrl('clip', 'original'), { headers: { Range: 'bytes=2-4' } }),
      registry
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-4/10')
    expect(await response.text()).toBe('234')
  })

  it('returns 404 for an unknown id, a missing proxy, or a URL that is not ours', async () => {
    const unknown = await serveMediaRequest(new Request(mediaUrl('nope', 'original')), registry)
    const noProxy = await serveMediaRequest(new Request(mediaUrl('clip', 'proxy')), registry)
    const foreign = await serveMediaRequest(new Request('file:///etc/passwd'), registry)
    expect([unknown.status, noProxy.status, foreign.status]).toEqual([404, 404, 404])
  })

  it('sends Access-Control-Allow-Origin on full, range, partial and error responses', async () => {
    const full = await serveMediaRequest(new Request(mediaUrl('clip', 'original')), registry)
    const range = await serveMediaRequest(
      new Request(mediaUrl('clip', 'original'), { headers: { Range: 'bytes=2-4' } }),
      registry
    )
    const partial = await serveMediaRequest(
      new Request(mediaUrl('clip', 'original'), { headers: { Range: 'bytes=8-' } }),
      registry
    )
    const unsatisfiable = await serveMediaRequest(
      new Request(mediaUrl('clip', 'original'), { headers: { Range: 'bytes=50-' } }),
      registry
    )
    const missing = await serveMediaRequest(new Request(mediaUrl('nope', 'original')), registry)
    const responses = [full, range, partial, unsatisfiable, missing]
    expect(responses.map((response) => response.status)).toEqual([200, 206, 206, 416, 404])
    for (const response of responses) {
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    }
  })
})
