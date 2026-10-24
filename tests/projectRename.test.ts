import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, projectSchema, type Project } from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { renameProjectCommand } from '@renderer/features/project/projectCommands'

const project: Project = projectSchema.parse({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'p1',
  name: 'Harbour interview',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  media: [],
  mediaTags: [],
  defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
  shorts: [],
  scripts: []
})

describe('rename project command', () => {
  it('renames and can be undone', () => {
    const history = createHistoryStore(project)
    history.getState().execute(renameProjectCommand('  Dock talk  '))
    expect(history.getState().present.name).toBe('Dock talk')

    history.getState().undo()
    expect(history.getState().present.name).toBe('Harbour interview')
  })

  it('refuses an empty name', () => {
    const history = createHistoryStore(project)
    expect(() => history.getState().execute(renameProjectCommand('   '))).toThrow()
    expect(history.getState().present.name).toBe('Harbour interview')
  })
})
