// Where a short's poster frame is read from. The renderer shows posters through the aism-media protocol,
// not as data URLs: the page's CSP (img-src) allows aism-media, and the URL names only a short id and a
// cache file name. A version query changes the URL when a frame is rendered again, so the browser never
// keeps showing an old image. Pure, so the URL rules are tested without Electron.
import { MEDIA_SCHEME } from './previewSource'

export const POSTER_HOST = 'poster'

const SHORT_ID = /^[A-Za-z0-9_-]+$/
const POSTER_FILE = /^[A-Za-z0-9_-]+-\d+\.jpg$/

export function posterUrl(shortId: string, fileName: string, version?: number): string {
  const query = version === undefined ? '' : `?v=${version}`
  return `${MEDIA_SCHEME}://${POSTER_HOST}/${shortId}/${fileName}${query}`
}

// The short and cache file a poster URL names, or null for anything else. The path must be exactly
// two safe segments, so traversal segments are refused. The query is ignored.
export function parsePosterUrl(url: string): { shortId: string; fileName: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.host !== POSTER_HOST) return null
  const parts = parsed.pathname.split('/')
  if (parts.length !== 3 || parts[0] !== '') return null
  const [, shortId, fileName] = parts
  if (!SHORT_ID.test(shortId) || !POSTER_FILE.test(fileName)) return null
  return { shortId, fileName }
}
