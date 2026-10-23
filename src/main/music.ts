/**
 * Deterministically choose a music track for a short from the project's music library. Export and the
 * editor preview both call this with the same list, so the preview plays the track the export will use.
 */
export function pickMusicTrack(tracks: string[], shortId: string): string | null {
  if (tracks.length === 0) return null
  const hash = [...shortId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return tracks[hash % tracks.length]
}
