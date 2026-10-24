import { describe, expect, it } from 'vitest'
import { LEFT_TOOLS, uiLayoutSchema } from '@shared/layout'
import { LEFT_TOOL_DEFINITIONS, RAIL_TOOLS } from '@renderer/features/layout/leftTools'

describe('icon rail', () => {
  it('shows Media, Clip Finder, Text, Audio, Transitions and Captions, in that order', () => {
    expect(RAIL_TOOLS.map((id) => LEFT_TOOL_DEFINITIONS[id].label)).toEqual([
      'Media',
      'Clip Finder',
      'Text',
      'Audio',
      'Transitions',
      'Captions'
    ])
  })

  it('marks only Clip Finder as an AI tool', () => {
    expect(RAIL_TOOLS.filter((id) => LEFT_TOOL_DEFINITIONS[id].ai)).toEqual(['ai-clip-finder'])
  })

  it('has a definition for every left tool, and the rail uses only known tools', () => {
    for (const id of LEFT_TOOLS) {
      expect(LEFT_TOOL_DEFINITIONS[id]).toBeDefined()
    }
    for (const id of RAIL_TOOLS) {
      expect(LEFT_TOOLS).toContain(id)
    }
  })

  it('saves and restores every rail tool through the layout schema', () => {
    for (const leftTool of RAIL_TOOLS) {
      const parsed = uiLayoutSchema.safeParse({
        leftTool,
        panes: {
          left: { size: 320, collapsed: false },
          right: { size: 300, collapsed: false },
          bottom: { size: 240, collapsed: false }
        }
      })
      expect(parsed.success).toBe(true)
    }
  })
})
