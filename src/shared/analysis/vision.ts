// The vision stage's rules: what a described shot looks like on disk, how shots are batched into
// requests, how a reply is read, and how long to wait before a retry. Pure, so the rules are tested
// without the API, the disk or the clock.
import { z } from 'zod'
import { visionModelSchema } from '../ai/aiSettings'

// Shots sent in one request. Each shot brings two or three frames.
export const VISION_BATCH_SHOTS = 5
// Enough room for a short description and tags for every shot in a batch.
export const VISION_MAX_TOKENS = 1200
// Tries per request, the first one included. Only retryable failures are tried again.
export const VISION_MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
const MAX_RETRY_AFTER_MS = 60000

// The frames a description was made from, by file name and modified time. A description is reused on a
// later run only when its frames are unchanged, so a re-detected shot is described again.
export const visionFrameSchema = z.object({
  name: z.string().min(1),
  mtimeMs: z.number().nonnegative()
})

export const visionShotSchema = z.object({
  shotIndex: z.number().int().nonnegative(),
  description: z.string().min(1).max(300),
  tags: z.array(z.string().min(1).max(40)).max(8),
  frames: z.array(visionFrameSchema)
})
export type VisionShotResult = z.infer<typeof visionShotSchema>

// The vision results for one media item, kept in the project's analysis folder.
export const visionResultFileSchema = z.object({
  model: visionModelSchema,
  shots: z.array(visionShotSchema)
})
export type VisionResultFile = z.infer<typeof visionResultFileSchema>

/** Splits items into consecutive groups of at most size. */
export function batchItems<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = []
  const step = Math.max(1, Math.floor(size))
  for (let start = 0; start < items.length; start += step) {
    batches.push(items.slice(start, start + step))
  }
  return batches
}

/** True when a saved description was made from exactly these frames. */
export function sameFrames(
  saved: readonly { name: string; mtimeMs: number }[],
  current: readonly { name: string; mtimeMs: number }[]
): boolean {
  return (
    saved.length === current.length &&
    saved.every((frame, index) => {
      const other = current[index]
      return frame.name === other.name && frame.mtimeMs === other.mtimeMs
    })
  )
}

/**
 * How long to wait before retry number `retry` (1 for the first retry). Doubles each time up to a cap.
 * A server's Retry-After wins when it asks for longer, up to a longer cap.
 */
export function retryDelayMs(retry: number, retryAfterMs?: number): number {
  const computed = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (retry - 1))
  if (retryAfterMs === undefined) return computed
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(computed, retryAfterMs))
}

/** The instruction sent with a batch of shot frames. It asks for JSON only, one entry per shot. */
export function buildVisionPrompt(shotIndexes: readonly number[]): string {
  return [
    'These are still frames from short-form video footage, grouped by shot. Each shot is labelled',
    'with its number and has two or three frames.',
    `For each of these shots (${shotIndexes.join(', ')}), write a short description of what is on`,
    'screen in one sentence of under 25 words, and up to 6 short lowercase tags (for example',
    '"close-up", "outdoor", "crowd", "text on screen").',
    'Reply with only a JSON array and no other text, in this form:',
    '[{"shot": 0, "description": "...", "tags": ["..."]}]',
    'Include every shot listed.'
  ].join(' ')
}

const replyItemSchema = z.object({
  shot: z.number().int().nonnegative(),
  description: z.string().trim().min(1).max(300),
  tags: z.array(z.string().trim().min(1).max(40)).max(8)
})

export interface ReadShot {
  shotIndex: number
  description: string
  tags: string[]
}

/**
 * Reads a reply into one entry per expected shot. The reply may wrap the array in a code fence or add
 * text around it. Entries for shots that were not asked for are dropped. Undefined when no JSON array
 * can be read at all. Shots missing from the reply are left out, so the caller can see them.
 */
export function parseVisionReply(
  text: string,
  expectedIndexes: readonly number[]
): ReadShot[] | undefined {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) return undefined
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  const parsed = z.array(z.unknown()).safeParse(json)
  if (!parsed.success) return undefined
  const wanted = new Set(expectedIndexes)
  const found = new Map<number, ReadShot>()
  for (const raw of parsed.data) {
    const item = replyItemSchema.safeParse(raw)
    if (!item.success) continue
    if (!wanted.has(item.data.shot) || found.has(item.data.shot)) continue
    found.set(item.data.shot, {
      shotIndex: item.data.shot,
      description: item.data.description,
      tags: item.data.tags
    })
  }
  return [...found.values()]
}
