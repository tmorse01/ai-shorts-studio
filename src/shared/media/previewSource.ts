// Where preview playback reads footage from. Main serves each file through a custom protocol, so the
// renderer never sees a file:// path. The URL names a media id and a variant, never a path, and main
// looks the path up from its own registry. Pure, so the URL rules are tested without Electron.

export const MEDIA_SCHEME = 'aism-media'

export type MediaVariant = 'original' | 'proxy'

export function mediaUrl(mediaId: string, variant: MediaVariant): string {
  return `${MEDIA_SCHEME}://media/${mediaId}/${variant}`
}

// The id and variant a media URL names, or null for anything else. The whole string must match, so
// dot segments and extra parts are refused rather than normalised by the URL parser.
export function parseMediaUrl(url: string): { mediaId: string; variant: MediaVariant } | null {
  const match = /^aism-media:\/\/media\/([A-Za-z0-9_-]+)\/(original|proxy)$/.exec(url)
  if (!match) return null
  return { mediaId: match[1], variant: match[2] as MediaVariant }
}

// Playback reads the proxy by default, and falls back to the original while no proxy exists. The
// original is always used when the user turns on "Originals", and when paused, so the frame on
// screen is drawn from the source file.
export function chooseVariant(options: {
  useOriginals: boolean
  playing: boolean
  proxyReady: boolean
}): MediaVariant {
  if (!options.playing || options.useOriginals || !options.proxyReady) return 'original'
  return 'proxy'
}
