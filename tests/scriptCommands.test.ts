import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  type Script,
  type Short
} from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import {
  addScriptLineCommand,
  attachScriptCommand,
  createScriptCommand,
  editScriptLineCommand,
  moveScriptLineCommand,
  removeScriptLineCommand,
  rewriteScriptLineCommand
} from '@renderer/features/scripts/scriptCommands'

const NOW = '2026-10-24T12:00:00.000Z'

const script = (id = 's1'): Script => ({
  id,
  title: 'Harbour hook',
  topic: 'Fishing boats',
  lines: [
    { id: 'l1', text: 'Opening line' },
    { id: 'l2', text: 'Second line', beat: 'setup', footageHints: ['wide shot'] },
    { id: 'l3', text: 'Closing line' }
  ]
})

const short = (id = 'short_1'): Short => ({
  id,
  name: 'Short 1',
  createdAt: NOW,
  updatedAt: NOW,
  status: 'draft',
  order: 0,
  targetLength: { minSec: 30, maxSec: 60 },
  platform: 'generic',
  overrides: {},
  editedSinceExport: false,
  timeline: { tracks: [] }
})

function projectWith(scripts: Script[] = [], shorts: Short[] = []): Project {
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
    shorts,
    scripts
  }
}

function apply(project: Project, command: ReturnType<typeof createScriptCommand>): Project {
  return produce(project, (draft) => command.produce(draft))
}

describe('script commands', () => {
  it('creates a script with its lines', () => {
    const next = apply(projectWith(), createScriptCommand(script()))
    expect(next.scripts).toEqual([script()])
  })

  it('refuses a blank title and a duplicate id', () => {
    expect(() => apply(projectWith(), createScriptCommand({ ...script(), title: '  ' }))).toThrow(
      'needs a title'
    )
    expect(() => apply(projectWith([script()]), createScriptCommand(script()))).toThrow(
      'already exists'
    )
  })

  it('edits the text of one line and keeps its other fields', () => {
    const next = apply(projectWith([script()]), editScriptLineCommand('s1', 'l2', 'Rewritten'))
    expect(next.scripts[0].lines[1]).toEqual({
      id: 'l2',
      text: 'Rewritten',
      beat: 'setup',
      footageHints: ['wide shot']
    })
  })

  it('adds a line at the end by default and at a given index', () => {
    const end = apply(
      projectWith([script()]),
      addScriptLineCommand('s1', { id: 'l4', text: 'New end' })
    )
    expect(end.scripts[0].lines.map((line) => line.id)).toEqual(['l1', 'l2', 'l3', 'l4'])

    const middle = apply(
      projectWith([script()]),
      addScriptLineCommand('s1', { id: 'l4', text: 'New' }, 1)
    )
    expect(middle.scripts[0].lines.map((line) => line.id)).toEqual(['l1', 'l4', 'l2', 'l3'])
  })

  it('refuses a duplicate line id and an index outside the script', () => {
    expect(() =>
      apply(projectWith([script()]), addScriptLineCommand('s1', { id: 'l1', text: 'Dup' }))
    ).toThrow('already in the script')
    expect(() =>
      apply(projectWith([script()]), addScriptLineCommand('s1', { id: 'l4', text: 'x' }, 9))
    ).toThrow('cannot go at that position')
  })

  it('removes a line', () => {
    const next = apply(projectWith([script()]), removeScriptLineCommand('s1', 'l2'))
    expect(next.scripts[0].lines.map((line) => line.id)).toEqual(['l1', 'l3'])
  })

  it('moves a line to a new position in the final list', () => {
    const next = apply(projectWith([script()]), moveScriptLineCommand('s1', 'l1', 2))
    expect(next.scripts[0].lines.map((line) => line.id)).toEqual(['l2', 'l3', 'l1'])
    expect(() => apply(projectWith([script()]), moveScriptLineCommand('s1', 'l1', 3))).toThrow(
      'cannot go at that position'
    )
  })

  it('reports a missing script or line in plain language', () => {
    expect(() => apply(projectWith(), editScriptLineCommand('gone', 'l1', 'x'))).toThrow(
      'no longer exists'
    )
    expect(() => apply(projectWith([script()]), removeScriptLineCommand('s1', 'gone'))).toThrow(
      'no longer exists'
    )
  })

  it('attaches a script to a short and detaches it again', () => {
    const attached = apply(
      projectWith([script()], [short()]),
      attachScriptCommand('short_1', 's1', NOW)
    )
    expect(attached.shorts[0].scriptId).toBe('s1')

    const detached = apply(attached, attachScriptCommand('short_1', null, NOW))
    expect(detached.shorts[0]).not.toHaveProperty('scriptId')
  })

  it('refuses to attach a script that is not in the project', () => {
    expect(() =>
      apply(projectWith([], [short()]), attachScriptCommand('short_1', 'gone', NOW))
    ).toThrow('no longer exists')
  })

  it('flags an exported short as edited when a script is attached', () => {
    const exported = { ...short(), status: 'exported' as const }
    const next = apply(
      projectWith([script()], [exported]),
      attachScriptCommand('short_1', 's1', NOW)
    )
    expect(next.shorts[0].editedSinceExport).toBe(true)
  })
})

describe('script commands through the project history', () => {
  it('undoes and redoes script edits in order', () => {
    const history = createHistoryStore(projectWith())
    history.getState().execute(createScriptCommand(script()))
    history.getState().execute(addScriptLineCommand('s1', { id: 'l4', text: 'Extra' }))
    history.getState().execute(removeScriptLineCommand('s1', 'l1'))
    expect(history.getState().present.scripts[0].lines.map((line) => line.id)).toEqual([
      'l2',
      'l3',
      'l4'
    ])

    history.getState().undo()
    expect(history.getState().present.scripts[0].lines.map((line) => line.id)).toEqual([
      'l1',
      'l2',
      'l3',
      'l4'
    ])

    history.getState().undo()
    history.getState().undo()
    expect(history.getState().present.scripts).toEqual([])

    history.getState().redo()
    history.getState().redo()
    expect(history.getState().present.scripts[0].lines).toHaveLength(4)
  })

  it('undoes an attach to a short', () => {
    const history = createHistoryStore(projectWith([script()], [short()]))
    history.getState().execute(attachScriptCommand('short_1', 's1', NOW))
    expect(history.getState().present.shorts[0].scriptId).toBe('s1')
    history.getState().undo()
    expect(history.getState().present.shorts[0].scriptId).toBeUndefined()
  })

  it('merges repeated edits to the same line into one undo step', () => {
    let clock = 1000
    const history = createHistoryStore(projectWith([script()]), { now: () => clock })
    history.getState().execute(editScriptLineCommand('s1', 'l1', 'O'))
    clock += 100
    history.getState().execute(editScriptLineCommand('s1', 'l1', 'Op'))
    clock += 100
    history.getState().execute(editScriptLineCommand('s1', 'l1', 'Opening'))
    expect(history.getState().past).toHaveLength(1)
    history.getState().undo()
    expect(history.getState().present.scripts[0].lines[0].text).toBe('Opening line')
  })
})

describe('rewrite script line command', () => {
  it('replaces the line text and undoes it in one step', () => {
    const history = createHistoryStore(projectWith([script()]))
    history.getState().execute(rewriteScriptLineCommand('s1', 'l2', '  Shorter line  '))
    expect(history.getState().present.scripts[0].lines[1].text).toBe('Shorter line')

    history.getState().undo()
    expect(history.getState().present.scripts[0].lines[1].text).toBe('Second line')
  })

  it('stays its own step after typing, so undo restores the typed text', () => {
    const history = createHistoryStore(projectWith([script()]))
    history.getState().execute(editScriptLineCommand('s1', 'l2', 'Typed edit'))
    history.getState().execute(rewriteScriptLineCommand('s1', 'l2', 'Rewritten'))
    history.getState().undo()
    expect(history.getState().present.scripts[0].lines[1].text).toBe('Typed edit')
  })

  it('refuses an empty rewrite and a missing line', () => {
    const history = createHistoryStore(projectWith([script()]))
    expect(() => history.getState().execute(rewriteScriptLineCommand('s1', 'l2', '   '))).toThrow(
      'A line needs some text.'
    )
    expect(() =>
      history.getState().execute(rewriteScriptLineCommand('s1', 'nope', 'Text'))
    ).toThrow('This line no longer exists.')
  })
})
