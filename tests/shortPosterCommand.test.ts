import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project,
  type Short
} from '@shared/project/schema'
import { IDENTITY_TRANSFORM } from '@shared/timeline/timeline'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { setShortPosterCommand } from '@renderer/features/shorts/shortCommands'

const NOW = '2026-10-24T10:00:00.000Z'

function projectWithShort(): Project {
  const short: Short = {
    id: 's1',
    name: 'Short 1',
    createdAt: NOW,
    updatedAt: NOW,
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: {
      tracks: [
        {
          id: 'v1',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            {
              id: 'c1',
              mediaId: 'm1',
              startMs: 0,
              durationMs: 4000,
              sourceInMs: 0,
              transform: IDENTITY_TRANSFORM
            }
          ]
        }
      ]
    }
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'p1',
    name: 'Demo',
    createdAt: NOW,
    updatedAt: NOW,
    media: [],
    mediaTags: [],
    defaults: DEFAULT_SHORT_DEFAULTS,
    shorts: [short],
    scripts: []
  }
}

describe('setShortPosterCommand', () => {
  it('sets the poster time, rounded to whole milliseconds, and can be undone', () => {
    const history = createHistoryStore(projectWithShort())
    history.getState().execute(setShortPosterCommand('s1', 2345.6, NOW))

    expect(history.getState().present.shorts[0].posterMs).toBe(2346)

    history.getState().undo()
    expect(history.getState().present.shorts[0].posterMs).toBeUndefined()
  })

  it('never stores a negative time', () => {
    const history = createHistoryStore(projectWithShort())
    history.getState().execute(setShortPosterCommand('s1', -5, NOW))
    expect(history.getState().present.shorts[0].posterMs).toBe(0)
  })
})
