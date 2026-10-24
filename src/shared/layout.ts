// The editor layout as the app saves it: the active left tool, and each pane's size and collapsed
// state. Shared so main validates what it writes to disk and the renderer validates what it reads
// back.
import { z } from 'zod'

// Every left panel. The icon rail shows the first six; Export opens from the top bar.
export const LEFT_TOOLS = [
  'media',
  'ai-clip-finder',
  'text',
  'audio',
  'transitions',
  'captions',
  'export'
] as const
export type LeftTool = (typeof LEFT_TOOLS)[number]

export const PANE_IDS = ['left', 'right', 'bottom'] as const
export type PaneId = (typeof PANE_IDS)[number]

export const paneStateSchema = z.object({
  // Pixels: the width of the left and right panes, or the height of the bottom pane.
  size: z.number().finite().min(0).max(10000),
  collapsed: z.boolean()
})

export const uiLayoutSchema = z.object({
  leftTool: z.enum(LEFT_TOOLS),
  panes: z.object({
    left: paneStateSchema,
    right: paneStateSchema,
    bottom: paneStateSchema
  })
})
export type UiLayout = z.infer<typeof uiLayoutSchema>
