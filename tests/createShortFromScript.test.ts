import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Project, type Script } from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { createShortFromScriptCommand } from '@renderer/features/scripts/scriptCommands'

const NOW = '2026-10-24T12:00:00.000Z'

const script: Script = { id: 's1', title: 'Harbour hook', topic: '', lines: [] }

function projectWith(scripts: Script[]): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour',
    createdAt: NOW,
    updatedAt: NOW,
    media: [],
    mediaTags: [],
    moments: [],
    defaults: {
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      safeZones: true
    },
    shorts: [],
    scripts
  }
}

describe('createShortFromScriptCommand', () => {
  it('creates a short attached to the script in one undo step', () => {
    const history = createHistoryStore(projectWith([script]))
    history.getState().execute(createShortFromScriptCommand('short_1', 's1', NOW))
    const [short] = history.getState().present.shorts
    expect(short.id).toBe('short_1')
    expect(short.scriptId).toBe('s1')

    history.getState().undo()
    expect(history.getState().present.shorts).toHaveLength(0)
  })

  it('leaves the project unchanged when the script is missing', () => {
    const history = createHistoryStore(projectWith([]))
    const before = history.getState().present
    expect(() =>
      history.getState().execute(createShortFromScriptCommand('short_1', 'gone', NOW))
    ).toThrow('no longer exists')
    expect(history.getState().present).toBe(before)
  })
})
