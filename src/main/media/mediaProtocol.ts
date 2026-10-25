// Serves footage for the preview over the aism-media protocol. Only files the registry knows by media
// id are served, and byte ranges are honoured so the video element can seek. No file:// URLs are
// ever handed to the renderer.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { parseMediaUrl } from '@shared/media/previewSource'
import { parsePosterUrl } from '@shared/media/posterSource'
import type { MediaSourceRegistry } from './mediaSources'

export interface ByteRange {
  start: number
  end: number
}

// Reads one "bytes=" range. Returns null when there is no usable range (serve the whole file) and
// 'unsatisfiable' when the range lies outside the file.
export function parseByteRange(
  header: string | null,
  size: number
): ByteRange | 'unsatisfiable' | null {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startText, endText] = match
  if (startText === '' && endText === '') return null
  if (size === 0) return 'unsatisfiable'

  if (startText === '') {
    const suffix = Number(endText)
    if (suffix === 0) return 'unsatisfiable'
    return { start: Math.max(size - suffix, 0), end: size - 1 }
  }

  const start = Number(startText)
  const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1)
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function fileBody(path: string, range?: ByteRange): ReadableStream {
  const stream = range
    ? createReadStream(path, { start: range.start, end: range.end })
    : createReadStream(path)
  return Readable.toWeb(stream) as ReadableStream
}

// The renderer loads footage cross-origin (aism-media is not the page's origin). Without this header
// Chromium gives silence from a MediaElementSource, so every response carries it: 200, 206, 404, 416.
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*'
}

const notFound = (): Response => new Response('Not found', { status: 404, headers: CORS_HEADERS })

// A short's poster frame, read from its project's cache folder. The URL names the short and the cache
// file, both checked by parsePosterUrl, so nothing else in the folder can be reached.
async function servePoster(
  shortId: string,
  fileName: string,
  registry: MediaSourceRegistry
): Promise<Response> {
  const folder = registry.posterFolder(shortId)
  if (!folder) return notFound()
  const file = join(folder, 'cache', 'posters', shortId, fileName)
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size === 0) return notFound()
    return new Response(fileBody(file), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'image/jpeg',
        'Content-Length': String(info.size),
        'Cache-Control': 'no-cache'
      }
    })
  } catch {
    return notFound()
  }
}

export async function serveMediaRequest(
  request: Request,
  registry: MediaSourceRegistry
): Promise<Response> {
  const poster = parsePosterUrl(request.url)
  if (poster) return servePoster(poster.shortId, poster.fileName, registry)
  const parsed = parseMediaUrl(request.url)
  const paths = parsed ? registry.get(parsed.mediaId) : undefined
  if (!parsed || !paths) return notFound()
  const file = parsed.variant === 'proxy' ? paths.proxy : paths.original
  if (file === null) return notFound()

  let size: number
  try {
    const info = await stat(file)
    if (!info.isFile()) return notFound()
    size = info.size
  } catch {
    return notFound()
  }

  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Accept-Ranges': 'bytes',
    'Content-Type': contentTypeOf(file)
  }
  const range = parseByteRange(request.headers.get('range'), size)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` }
    })
  }
  if (range === null) {
    return new Response(fileBody(file), {
      status: 200,
      headers: { ...headers, 'Content-Length': String(size) }
    })
  }
  return new Response(fileBody(file, range), {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`
    }
  })
}
