import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project,
  type Short
} from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { deleteShortCommand } from '@renderer/features/shorts/shortCommands'

const NOW = '2026-10-24T10:00:00.000Z'

function short(id: string, order: number): Short {
  return {
    id,
    name: `Short ${order + 1}`,
    createdAt: NOW,
    updatedAt: NOW,
    status: 'ready',
    order,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: { safeZones: false },
    editedSinceExport: false,
    timeline: { tracks: [] }
  }
}

describe('deleting a short and undoing it', () => {
  it('restores the same id, order and content', () => {
    const project: Project = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'proj_1',
      name: 'Harbour interview',
      createdAt: NOW,
      updatedAt: NOW,
      media: [],
      mediaTags: [],
      defaults: { ...DEFAULT_SHORT_DEFAULTS },
      shorts: [short('a', 0), short('b', 1), short('c', 2)],
      scripts: []
    }
    const history = createHistoryStore(project)

    history.getState().execute(deleteShortCommand('b'))
    expect(history.getState().present.shorts.map((s) => s.id)).toEqual(['a', 'c'])

    history.getState().undo()
    expect(history.getState().present).toEqual(project)
    expect(history.getState().present.shorts[1]).toEqual(short('b', 1))
  })
})
