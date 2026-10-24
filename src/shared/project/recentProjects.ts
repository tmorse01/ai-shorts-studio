// The recent-projects registry contract, shared by main (registry file) and renderer (dashboard).
// Each entry points at a project folder. The folder itself is never copied or moved by the registry.
import { z } from 'zod'
import type { MediaRef } from './schema'

const absolutePath = z.string().trim().min(1)

// The aspect ratio the dashboard shows for a project. Shorts are cut vertical, so this is the
// editor's default canvas (9:16). Projects do not store a ratio yet.
export const DEFAULT_PROJECT_RATIO = '9:16'

// Total length of a project's video footage in ms, or undefined when no video has a known length.
export function footageDurationMs(media: readonly MediaRef[]): number | undefined {
  const lengths = media.flatMap((item) =>
    item.kind === 'video' && item.durationMs !== undefined ? [item.durationMs] : []
  )
  return lengths.length > 0 ? lengths.reduce((sum, ms) => sum + ms, 0) : undefined
}

// What is kept on disk for one project folder.
export const storedRecentProjectSchema = z.object({
  folderPath: absolutePath,
  name: z.string().trim().min(1),
  lastOpened: z.iso.datetime(),
  shortCount: z.number().int().nonnegative(),
  // Where the project's thumbnail is (or will be) cached, inside the project folder.
  thumbnailPath: absolutePath.optional(),
  // Total footage length in ms (see footageDurationMs). Unset for older entries and for projects
  // with no timed video.
  durationMs: z.number().nonnegative().optional(),
  // Aspect ratio as "width:height", for example 9:16. Unset for older entries.
  ratio: z
    .string()
    .regex(/^\d+:\d+$/)
    .optional()
})
export type StoredRecentProject = z.infer<typeof storedRecentProjectSchema>

// What the renderer sees. `missing` is worked out on each list, so a folder that was moved or
// deleted stays listed (and can be located again) instead of disappearing.
export const recentProjectSchema = storedRecentProjectSchema.extend({
  missing: z.boolean()
})
export type RecentProject = z.infer<typeof recentProjectSchema>
