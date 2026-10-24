// The payload carried by a footage drag: a whole clip, a marked range of a source, or a saved moment.
// Every drag source (media cards, the source viewer's marks, moment rows) writes this, and every drop
// target reads it. The timeline's video lanes insert it as a clip (see footageDrop.ts). The MIME type
// is the only thing a drop target can read during dragover, so targets check `types` for DRAG_MIME
// and decode the data on drop.
import { z } from 'zod'

export const DRAG_MIME = 'application/x-aism-footage'

const nonEmptyString = z.string().trim().min(1)

const rangeFields = {
  // The media item (footage) the range is in.
  mediaId: nonEmptyString,
  // Source milliseconds, In inclusive and Out exclusive, as on a moment.
  inMs: z.number().int().nonnegative(),
  outMs: z.number().int().nonnegative()
}

export const dragPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clip'), ...rangeFields }),
  z.object({ kind: z.literal('range'), ...rangeFields }),
  z.object({ kind: z.literal('moment'), ...rangeFields, momentId: nonEmptyString })
])

export type DragPayload = z.infer<typeof dragPayloadSchema>

// A clip drags the whole footage item, from its start to its duration.
export function clipPayload(mediaId: string, durationMs: number): DragPayload {
  return { kind: 'clip', mediaId, inMs: 0, outMs: Math.max(Math.round(durationMs), 1) }
}

export function rangePayload(mediaId: string, inMs: number, outMs: number): DragPayload {
  return { kind: 'range', mediaId, inMs, outMs }
}

export function momentPayload(moment: {
  id: string
  mediaId: string
  inMs: number
  outMs: number
}): DragPayload {
  return {
    kind: 'moment',
    mediaId: moment.mediaId,
    inMs: moment.inMs,
    outMs: moment.outMs,
    momentId: moment.id
  }
}

export function encodeDragPayload(payload: DragPayload): string {
  return JSON.stringify(payload)
}

// Returns the payload, or null when the text is not one. Drop targets must not trust drag data
// from elsewhere, so the decoded value is validated the same way as any IPC input.
export function decodeDragPayload(raw: string): DragPayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const result = dragPayloadSchema.safeParse(parsed)
  if (!result.success) return null
  if (result.data.outMs <= result.data.inMs) return null
  return result.data
}

// True when a dragover event carries a footage payload. Reads only `types`, which is all a
// dragover may read.
export function carriesFootage(types: readonly string[] | DOMStringList): boolean {
  return Array.from(types).includes(DRAG_MIME)
}
