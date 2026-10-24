import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import type { Project } from '@shared/project/schema'
import { IDENTITY_TRANSFORM } from '@shared/timeline/timeline'
import { timelineCommand } from '@renderer/features/timeline/timelineCommands'

const NOW = '2026-10-24T10:00:00.000Z'

function projectWith(status: 'draft' | 'exported'): Project {
  const clip = {
    id: 'a',
    startMs: 0,
    durationMs: 1000,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM
  }
  return {
    shorts: [
      {
        id: 's1',
        status,
        updatedAt: '2026-10-23T09:00:00.000Z',
        editedSinceExport: false,
        timeline: {
          tracks: [{ id: 'main', kind: 'video', role: 'main', muted: false, clips: [clip] }]
        }
      }
    ]
  } as unknown as Project
}

describe('timeline commands', () => {
  it('applies a pure edit to the short timeline and stamps the short', () => {
    const command = timelineCommand('s1', 'Delete clip', NOW, (timeline) => ({
      ...timeline,
      tracks: [{ ...timeline.tracks[0], clips: [] }]
    }))
    const next = produce(projectWith('draft'), (draft) => command.produce(draft))
    expect(next.shorts[0].timeline.tracks[0].clips).toEqual([])
    expect(next.shorts[0].updatedAt).toBe(NOW)
    expect(next.shorts[0].editedSinceExport).toBe(false)
  })

  it('flags an exported short as edited since export', () => {
    const command = timelineCommand('s1', 'Move clip', NOW, (timeline) => timeline)
    const next = produce(projectWith('exported'), (draft) => command.produce(draft))
    expect(next.shorts[0].editedSinceExport).toBe(true)
  })

  it('passes the merge key through so a drag folds into one history entry', () => {
    const command = timelineCommand('s1', 'Drag clip', NOW, (timeline) => timeline, 'drag:a')
    expect(command.mergeKey).toBe('drag:a')
  })

  it('throws for a short that does not exist', () => {
    const command = timelineCommand('missing', 'Edit', NOW, (timeline) => timeline)
    expect(() => produce(projectWith('draft'), (draft) => command.produce(draft))).toThrow(
      'No short with id missing'
    )
  })
})
