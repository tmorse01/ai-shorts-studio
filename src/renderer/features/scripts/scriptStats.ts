// Word count and estimated read time for a script. Pure functions, so the editor and the Scripts
// list show the same numbers and the maths can be tested directly.
import type { Script } from '@shared/project/schema'

// A comfortable speaking pace for voiceover. The estimate is for planning, not timing.
export const READ_WORDS_PER_MINUTE = 150

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export function scriptWordCount(script: Pick<Script, 'lines'>): number {
  return script.lines.reduce((total, line) => total + countWords(line.text), 0)
}

export function estimatedReadSeconds(words: number): number {
  return Math.round((words / READ_WORDS_PER_MINUTE) * 60)
}

// Plain-language read time: "45 sec", "2 min" or "2 min 5 sec".
export function formatReadTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`
}
