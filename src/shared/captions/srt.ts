// SubRip (SRT) text for a short's caption blocks (Epic 11, #121). Pure: it reads the captions tracks of a
// timeline and returns text. Caption blocks already hold timeline milliseconds, so the cues are timed on
// the short's own timeline, from its start at 0. Saving the file is the caller's job.
import type { Timeline } from '../timeline/timeline'
import type { CaptionBlock } from './captionBlock'
import { blockSpanMs } from './captionTiming'

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const MS_PER_SECOND = 1000

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

// An SRT timestamp: HH:MM:SS,mmm. Negative times clamp to zero.
export function srtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const hours = Math.floor(total / MS_PER_HOUR)
  const minutes = Math.floor((total % MS_PER_HOUR) / MS_PER_MINUTE)
  const seconds = Math.floor((total % MS_PER_MINUTE) / MS_PER_SECOND)
  const millis = total % MS_PER_SECOND
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
}

// Every caption block on the timeline's captions tracks, in start-time order.
export function captionBlocksInOrder(timeline: Timeline): CaptionBlock[] {
  const blocks = timeline.tracks
    .filter((track) => track.role === 'captions')
    .flatMap((track) => track.captions ?? [])
  return blocks.sort((a, b) => blockSpanMs(a).startMs - blockSpanMs(b).startMs)
}

// The SRT document for a timeline's captions: numbered cues, each with its time span and its words
// joined by spaces. Empty when the timeline has no captions.
export function buildSrt(timeline: Timeline): string {
  const cues = captionBlocksInOrder(timeline).map((block, index) => {
    const { startMs, endMs } = blockSpanMs(block)
    const text = block.words.map((word) => word.text).join(' ')
    return `${index + 1}\n${srtTimestamp(startMs)} --> ${srtTimestamp(endMs)}\n${text}\n`
  })
  return cues.join('\n')
}

// A file name for the export, from the short's name. Characters Windows does not allow are dropped.
export function srtFileName(shortName: string): string {
  const forbidden = '\\/:*?"<>|'
  const cleaned = Array.from(shortName)
    .filter((char) => char.charCodeAt(0) >= 32 && !forbidden.includes(char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return `${cleaned === '' ? 'captions' : cleaned}.srt`
}
