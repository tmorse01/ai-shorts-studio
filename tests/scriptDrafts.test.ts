import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import type { GeneratedScript } from '@shared/ai/scriptGeneration'
import { CURRENT_SCHEMA_VERSION, type Project } from '@shared/project/schema'
import { createScriptsCommand } from '@renderer/features/scripts/scriptCommands'
import { scriptsFromDrafts } from '@renderer/features/scripts/scriptDrafts'

const NOW = '2026-10-24T12:00:00.000Z'

const drafts: GeneratedScript[] = [
  {
    title: 'Dawn',
    topic: 'Boats',
    lines: [
      { text: 'The boats leave.', beat: 'hook', footageHints: ['dock.mp4, 0:04'] },
      { text: 'Gulls.' }
    ]
  },
  { title: 'Dusk', topic: '', lines: [{ text: 'They return.' }] }
]

function emptyProject(): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'p1',
    name: 'Harbour',
    createdAt: NOW,
    updatedAt: NOW,
    media: [],
    mediaTags: [],
    moments: [],
    defaults: {} as Project['defaults'],
    shorts: [],
    scripts: []
  }
}

describe('scriptsFromDrafts', () => {
  it('gives every script and line a fresh id and keeps the optional planning notes only when set', () => {
    let next = 0
    const scripts = scriptsFromDrafts(drafts, () => `id${(next += 1)}`)

    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toEqual({
      id: 'id1',
      title: 'Dawn',
      topic: 'Boats',
      lines: [
        { id: 'id2', text: 'The boats leave.', beat: 'hook', footageHints: ['dock.mp4, 0:04'] },
        { id: 'id3', text: 'Gulls.' }
      ]
    })
    expect(scripts[1].lines[0]).toEqual({ id: 'id5', text: 'They return.' })
    expect(scripts[1].topic).toBe('')
  })
})

describe('createScriptsCommand', () => {
  it('adds every script in one produce step', () => {
    const scripts = scriptsFromDrafts(drafts, () => crypto.randomUUID())
    const next = produce(emptyProject(), (draft) => {
      createScriptsCommand(scripts).produce(draft)
    })

    expect(next.scripts.map((script) => script.title)).toEqual(['Dawn', 'Dusk'])
  })

  it('labels a single script by its title and a batch by its count', () => {
    const scripts = scriptsFromDrafts(drafts, () => crypto.randomUUID())

    expect(createScriptsCommand(scripts.slice(0, 1)).label).toBe('Create script Dawn')
    expect(createScriptsCommand(scripts).label).toBe('Create 2 scripts')
  })

  it('refuses a script whose id is already in the project, and adds nothing', () => {
    const scripts = scriptsFromDrafts(drafts, () => 'same')

    expect(() =>
      produce(emptyProject(), (draft) => {
        createScriptsCommand(scripts).produce(draft)
      })
    ).toThrow('A script with this id already exists.')
  })
})
