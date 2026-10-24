// The URL the renderer plays footage from. Main serves files under this scheme only after it has
// allowed them (see src/main/media/sourceProtocol.ts). Pure, so the mapping is tested directly.
export const SOURCE_SCHEME = 'studio-media'
const SOURCE_HOST = 'source'

// The URL for an absolute file path. The path is percent-encoded as one segment.
export function sourceUrlFor(filePath: string): string {
  return `${SOURCE_SCHEME}://${SOURCE_HOST}/${encodeURIComponent(filePath)}`
}

// The file path a source URL names, or null when the URL is not one of ours.
export function filePathFromSourceUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${SOURCE_SCHEME}:` || parsed.hostname !== SOURCE_HOST) return null
  const encoded = parsed.pathname.slice(1)
  if (encoded.length === 0) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}
