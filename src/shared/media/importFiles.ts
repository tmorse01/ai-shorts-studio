// Sorts picked or dropped files into the ones a project can import, the ones it already holds, and
// the ones it rejects. Pure, so the import rules are tested without Electron or the DOM.
import { z } from 'zod'
import type { MediaKind } from '../project/schema'

const KIND_BY_EXTENSION: Readonly<Record<string, MediaKind>> = {
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  m4v: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  ogg: 'audio',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  bmp: 'image',
  gif: 'image'
}

// The media kind for a file name, or null when the project cannot import the type.
export function mediaKindForFileName(fileName: string): MediaKind | null {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return null
  return KIND_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()] ?? null
}

// A file the OS reported: absolute path, base name and size in bytes.
export const importCandidateSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative()
})
export type ImportCandidate = z.infer<typeof importCandidateSchema>

// Paths compare without case and with one separator style, so C:\Clips\A.mp4 matches c:/clips/a.mp4.
export function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

// Duplicates are the same file: same path and same size.
function duplicateKey(file: { path: string; sizeBytes: number }): string {
  return `${comparablePath(file.path)}|${file.sizeBytes}`
}

export interface ImportPlan {
  accepted: (ImportCandidate & { kind: MediaKind })[]
  // Files the project already holds, or that repeat an earlier file in the same batch.
  duplicates: ImportCandidate[]
  rejected: { fileName: string; reason: string }[]
}

// `existing` holds the absolute path and size of each media file the project already has.
export function planImport(
  existing: readonly { path: string; sizeBytes: number }[],
  candidates: readonly ImportCandidate[]
): ImportPlan {
  const seen = new Set(existing.map(duplicateKey))
  const plan: ImportPlan = { accepted: [], duplicates: [], rejected: [] }

  for (const candidate of candidates) {
    const kind = mediaKindForFileName(candidate.fileName)
    if (kind === null) {
      plan.rejected.push({ fileName: candidate.fileName, reason: 'Unsupported file type.' })
      continue
    }
    const key = duplicateKey(candidate)
    if (seen.has(key)) {
      plan.duplicates.push(candidate)
      continue
    }
    seen.add(key)
    plan.accepted.push({ ...candidate, kind })
  }

  return plan
}
