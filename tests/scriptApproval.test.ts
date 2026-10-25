import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  projectSchema,
  type Project,
  type Script,
  type Short
} from '@shared/project/schema'
import { migrateV20ToV21 } from '@shared/project/migrations'
import {
  discardScriptCommand,
  replaceScriptDraftCommand,
  setScriptApprovalCommand
} from '@renderer/features/scripts/scriptCommands'

const NOW = '2026-10-24T12:00:00.000Z'

const script = (id = 's1'): Script => ({
  id,
  title: 'Harbour hook',
  topic: 'Fishing boats',
  lines: [{ id: 'l1', text: 'Opening line' }]
})

const short = (id: string, scriptId?: string): Short => ({
  id,
  name: `Short ${id}`,
  createdAt: NOW,
  updatedAt: NOW,
  status: 'draft',
  order: 0,
  targetLength: { minSec: 30, maxSec: 60 },
  platform: 'generic',
  overrides: {},
  editedSinceExport: false,
  timeline: { tracks: [] },
  ...(scriptId ? { scriptId } : {})
})

function projectWith(scripts: Script[], shorts: Short[] = []): Project {
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
  } as Project
}

describe('script approval commands', () => {
  it('approves and unapproves one script without touching the others', () => {
    const before = projectWith([script('s1'), script('s2')])
    const approved = produce(before, (draft) => {
      setScriptApprovalCommand('s1', 'approved', 'Harbour hook').produce(draft)
    })
    expect(approved.scripts[0].approval).toBe('approved')
    expect(approved.scripts[1].approval).toBeUndefined()

    const back = produce(approved, (draft) => {
      setScriptApprovalCommand('s1', 'draft', 'Harbour hook').produce(draft)
    })
    expect(back.scripts[0].approval).toBe('draft')
  })

  it('labels the approval command for approve and unapprove', () => {
    expect(setScriptApprovalCommand('s1', 'approved', 'Harbour hook').label).toBe(
      'Approve Harbour hook'
    )
    expect(setScriptApprovalCommand('s1', 'draft', 'Harbour hook').label).toBe(
      'Unapprove Harbour hook'
    )
  })

  it('discards a script and detaches shorts written from it', () => {
    const before = projectWith([script('s1'), script('s2')], [short('a', 's1'), short('b', 's2')])
    const after = produce(before, (draft) => {
      discardScriptCommand('s1', 'Harbour hook').produce(draft)
    })
    expect(after.scripts.map((item) => item.id)).toEqual(['s2'])
    expect(after.shorts[0].scriptId).toBeUndefined()
    expect(after.shorts[1].scriptId).toBe('s2')
  })

  it('regenerates a script in place, keeping its id and shorts, and returns it to draft', () => {
    const before = projectWith([{ ...script('s1'), approval: 'approved' }], [short('a', 's1')])
    const after = produce(before, (draft) => {
      replaceScriptDraftCommand('s1', {
        title: '  New hook  ',
        topic: ' New topic ',
        lines: [{ id: 'n1', text: 'New line' }]
      }).produce(draft)
    })
    expect(after.scripts[0]).toMatchObject({
      id: 's1',
      title: 'New hook',
      topic: 'New topic',
      approval: 'draft',
      lines: [{ id: 'n1', text: 'New line' }]
    })
    expect(after.shorts[0].scriptId).toBe('s1')
  })

  it('rejects a regenerated script with no title', () => {
    expect(() => replaceScriptDraftCommand('s1', { title: '   ', topic: '', lines: [] })).toThrow(
      'A script needs a title.'
    )
  })
})

describe('script approval schema', () => {
  it('migrates schema 20 to 21 with only the version changed', () => {
    const migrated = migrateV20ToV21({ schemaVersion: 20, id: 'p' }) as Record<string, unknown>
    expect(migrated).toEqual({ schemaVersion: 21, id: 'p' })
  })

  it('accepts scripts with and without an approval state', () => {
    const project = projectWith([{ ...script('s1'), approval: 'approved' }, script('s2')])
    expect(projectSchema.safeParse(project).success).toBe(true)
    const bad = { ...project, scripts: [{ ...script('s3'), approval: 'published' }] }
    expect(projectSchema.safeParse(bad).success).toBe(false)
  })
})
