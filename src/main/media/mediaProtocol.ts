// Serves footage for the preview over the aism-media protocol. Only files the registry knows by media
// id are served, and byte ranges are honoured so the video element can seek. No file:// URLs are
// ever handed to the renderer.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { parseMediaUrl } from '@shared/media/previewSource'
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

const notFound = (): Response => new Response('Not found', { status: 404 })

export async function serveMediaRequest(
  request: Request,
  registry: MediaSourceRegistry
): Promise<Response> {
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
