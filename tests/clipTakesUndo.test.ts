import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/project/schema'
import { swapClipAlternative } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Clip } from '@shared/timeline/timeline'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { timelineCommand } from '@renderer/features/timeline/timelineCommands'

const NOW = '2026-10-24T10:00:00.000Z'

function assembledClip(): Clip {
  return {
    id: 'c1',
    mediaId: 'm1',
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 1000,
    transform: { ...IDENTITY_TRANSFORM },
    assembly: {
      lineId: 'line_1',
      alternatives: [
        { sourceId: 'm2', inMs: 0, outMs: 5000 },
        { sourceId: 'm3', inMs: 4000, outMs: 4800 }
      ]
    }
  }
}

function projectWithClip(): Project {
  return {
    shorts: [
      {
        id: 's1',
        status: 'draft',
        updatedAt: NOW,
        editedSinceExport: false,
        timeline: {
          tracks: [
            { id: 'v1', kind: 'video', role: 'main', muted: false, clips: [assembledClip()] }
          ]
        }
      }
    ]
  } as unknown as Project
}

describe('undoing a clip alternative swap', () => {
  it('restores the previous clip when the swap is undone', () => {
    const store = createHistoryStore(projectWithClip())
    const before = store.getState().present
    const swap = timelineCommand('s1', 'Swap to take 1', NOW, (timeline) =>
      swapClipAlternative(timeline, 'c1', 0)
    )

    expect(store.getState().execute(swap)).toBe(true)
    const swapped = store.getState().present.shorts[0].timeline.tracks[0].clips[0]
    expect(swapped).toMatchObject({ mediaId: 'm2', sourceInMs: 0, durationMs: 2000 })

    store.getState().undo()
    expect(store.getState().present).toEqual(before)
    const restored = store.getState().present.shorts[0].timeline.tracks[0].clips[0]
    expect(restored).toMatchObject({ mediaId: 'm1', sourceInMs: 1000, durationMs: 2000 })
    expect(restored.assembly?.alternatives[0]).toEqual({ sourceId: 'm2', inMs: 0, outMs: 5000 })
  })
})
