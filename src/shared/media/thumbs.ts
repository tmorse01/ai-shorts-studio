// What a media item's thumbnail cache holds, and how a filmstrip is laid out. Pure, so the planning is
// tested without FFmpeg or the disk.
import type { MediaKind } from '../project/schema'

export const FILMSTRIP_MAX_FRAMES = 60
export const FILMSTRIP_COLUMNS = 10
export const FILMSTRIP_FILE = 'filmstrip.jpg'

export interface FilmstripPlan {
  frames: number
  // Seconds between frames: 1 for footage up to the frame cap, longer for footage beyond it.
  intervalSec: number
  columns: number
  rows: number
}

export function filmstripPlan(durationSec: number): FilmstripPlan {
  const intervalSec = Math.max(1, durationSec / FILMSTRIP_MAX_FRAMES)
  const frames = Math.min(Math.max(1, Math.ceil(durationSec / intervalSec)), FILMSTRIP_MAX_FRAMES)
  return {
    frames,
    intervalSec,
    columns: Math.min(frames, FILMSTRIP_COLUMNS),
    rows: Math.ceil(frames / FILMSTRIP_COLUMNS)
  }
}

// The file the thumbs job writes for each kind: a poster frame, a small image, or a waveform.
export function thumbFileName(kind: MediaKind): string {
  if (kind === 'video') return 'poster.jpg'
  if (kind === 'image') return 'thumb.jpg'
  return 'waveform.png'
}

// The cache files the renderer may read back. Only these names cross IPC, never a free path.
export const THUMB_READ_FILES = [FILMSTRIP_FILE, 'poster.jpg', 'thumb.jpg', 'waveform.png'] as const
export type ThumbReadFile = (typeof THUMB_READ_FILES)[number]
