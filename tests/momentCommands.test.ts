import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Moment, type Project } from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { removeMediaCommand } from '@renderer/features/media/mediaView'
import {
  addMomentCommand,
  deleteMomentCommand,
  renameMomentCommand,
  retagMomentCommand,
  setMomentStarredCommand
} from '@renderer/features/moments/momentCommands'
import {
  defaultMomentName,
  formatMomentDuration,
  momentsOfMedia
} from '@renderer/features/moments/momentView'

const moment = (id: string, patch: Partial<Moment> = {}): Moment => ({
  id,
  mediaId: 'm1',
  name: `Moment ${id}`,
  inMs: 1000,
  outMs: 4000,
  tags: [],
  createdBy: 'user',
  ...patch
})

function projectWith(moments: Moment[] = []): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    media: [
      {
        id: 'm1',
        path: 'G:\\Footage\\a.mp4',
        pathKind: 'absolute',
        fileName: 'a.mp4',
        sizeBytes: 1,
        kind: 'video'
      }
    ],
    mediaTags: [{ id: 'hook', name: 'Hook' }],
    moments,
    defaults: {
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      safeZones: true
    },
    shorts: [],
    scripts: []
  }
}

function apply(project: Project, command: ReturnType<typeof addMomentCommand>): Project {
  return produce(project, (draft) => command.produce(draft))
}

describe('moment commands', () => {
  it('saves a moment on a clip in the project', () => {
    const next = apply(projectWith(), addMomentCommand(moment('a')))
    expect(next.moments).toEqual([moment('a')])
  })

  it('refuses a moment for a clip that is not in the project', () => {
    const command = addMomentCommand(moment('a', { mediaId: 'gone' }))
    expect(() => apply(projectWith(), command)).toThrow('no longer in the project')
  })

  it('refuses an empty or reversed range and a duplicate id', () => {
    expect(() => apply(projectWith(), addMomentCommand(moment('a', { outMs: 1000 })))).toThrow(
      'Out point after its In point'
    )
    expect(() => apply(projectWith([moment('a')]), addMomentCommand(moment('a')))).toThrow(
      'already saved'
    )
  })

  it('renames a moment and trims the name', () => {
    const next = apply(projectWith([moment('a')]), renameMomentCommand('a', '  Berm drop  '))
    expect(next.moments[0]?.name).toBe('Berm drop')
  })

  it('refuses a blank name and a missing moment', () => {
    const base = projectWith([moment('a')])
    expect(() => apply(base, renameMomentCommand('a', '   '))).toThrow('needs a name')
    expect(() => apply(base, renameMomentCommand('zz', 'Name'))).toThrow('no longer exists')
  })

  it('deletes a moment and leaves the others in order', () => {
    const base = projectWith([moment('a'), moment('b'), moment('c')])
    const next = apply(base, deleteMomentCommand('b'))
    expect(next.moments.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('sets the tags of a moment without duplicates', () => {
    const next = apply(projectWith([moment('a')]), retagMomentCommand('a', ['hook', 'hook']))
    expect(next.moments[0]?.tags).toEqual(['hook'])
  })

  it('removing the clip also removes the moments saved from it', () => {
    const base = projectWith([moment('a'), moment('b', { mediaId: 'm2' })])
    const next = produce(base, (draft) => removeMediaCommand(['m1']).produce(draft))
    expect(next.media).toEqual([])
    expect(next.moments.map((item) => item.id)).toEqual(['b'])
  })

  it('undoes and redoes a save, a rename and a delete through the project history', () => {
    const history = createHistoryStore(projectWith())
    history.getState().execute(addMomentCommand(moment('a')))
    history.getState().execute(renameMomentCommand('a', 'Renamed'))
    history.getState().execute(deleteMomentCommand('a'))
    expect(history.getState().present.moments).toEqual([])

    history.getState().undo()
    expect(history.getState().present.moments[0]?.name).toBe('Renamed')
    history.getState().undo()
    expect(history.getState().present.moments[0]?.name).toBe('Moment a')
    history.getState().undo()
    expect(history.getState().present.moments).toEqual([])

    history.getState().redo()
    expect(history.getState().present.moments[0]?.id).toBe('a')
  })
})

describe('moment view', () => {
  it('lists the moments of one clip in source order', () => {
    const moments = [
      moment('late', { inMs: 9000, outMs: 9500 }),
      moment('other', { mediaId: 'm2' }),
      moment('early', { inMs: 500, outMs: 900 })
    ]
    expect(momentsOfMedia(moments, 'm1').map((item) => item.id)).toEqual(['early', 'late'])
  })

  it('shows short moments to a tenth of a second and longer ones as m:ss', () => {
    expect(formatMomentDuration(3500)).toBe('3.5s')
    expect(formatMomentDuration(59_000)).toBe('59.0s')
    expect(formatMomentDuration(61_000)).toBe('1:01')
  })

  it('names a new moment after the count of moments on the clip', () => {
    expect(defaultMomentName(0)).toBe('Moment 1')
    expect(defaultMomentName(4)).toBe('Moment 5')
  })
})

describe('setMomentStarredCommand', () => {
  it('stars a moment and removes the key again when unstarred', () => {
    const history = createHistoryStore(projectWith([moment('a')]))
    history.getState().execute(setMomentStarredCommand('a', true))
    expect(history.getState().present.moments[0]?.starred).toBe(true)
    history.getState().execute(setMomentStarredCommand('a', false))
    expect(history.getState().present.moments[0]).not.toHaveProperty('starred')
  })

  it('takes one undo step per toggle', () => {
    const history = createHistoryStore(projectWith([moment('a')]))
    history.getState().execute(setMomentStarredCommand('a', true))
    history.getState().execute(setMomentStarredCommand('a', false))
    history.getState().undo()
    expect(history.getState().present.moments[0]?.starred).toBe(true)
    history.getState().undo()
    expect(history.getState().present.moments[0]?.starred).toBeUndefined()
  })

  it('refuses a moment that no longer exists', () => {
    const history = createHistoryStore(projectWith([]))
    expect(() => history.getState().execute(setMomentStarredCommand('gone', true))).toThrow(
      'no longer exists'
    )
  })
})
