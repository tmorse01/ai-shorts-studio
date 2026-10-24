// The recent-projects registry contract, shared by main (registry file) and renderer (dashboard).
// Each entry points at a project folder. The folder itself is never copied or moved by the registry.
import { z } from 'zod'

const absolutePath = z.string().trim().min(1)

// What is kept on disk for one project folder.
export const storedRecentProjectSchema = z.object({
  folderPath: absolutePath,
  name: z.string().trim().min(1),
  lastOpened: z.iso.datetime(),
  shortCount: z.number().int().nonnegative(),
  // Where the project's thumbnail is (or will be) cached, inside the project folder.
  thumbnailPath: absolutePath.optional()
})
export type StoredRecentProject = z.infer<typeof storedRecentProjectSchema>

// What the renderer sees. `missing` is worked out on each list, so a folder that was moved or
// deleted stays listed (and can be located again) instead of disappearing.
export const recentProjectSchema = storedRecentProjectSchema.extend({
  missing: z.boolean()
})
export type RecentProject = z.infer<typeof recentProjectSchema>
