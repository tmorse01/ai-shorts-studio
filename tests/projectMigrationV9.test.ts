import { describe, expect, it } from 'vitest'
import { migrateV8ToV9 } from '@shared/project/migrations'
import { scriptSchema } from '@shared/project/schema'

describe('migrateV8ToV9', () => {
  it('turns placeholder scripts into titled scripts with typed lines', () => {
    const result = migrateV8ToV9({
      schemaVersion: 8,
      media: [{ id: 'm1', fileName: 'a.mp4' }],
      scripts: [
        {
          id: 'script_1',
          name: 'Hook options',
          lines: ['Opening line', { text: 'Second line' }, { id: 'kept', text: 'Third' }, 42]
        }
      ]
    }) as { schemaVersion: number; media: unknown[]; scripts: unknown[] }

    expect(result.schemaVersion).toBe(9)
    expect(result.media).toEqual([{ id: 'm1', fileName: 'a.mp4' }])
    expect(result.scripts).toEqual([
      {
        id: 'script_1',
        title: 'Hook options',
        topic: '',
        lines: [
          { id: 'script_1_line_1', text: 'Opening line' },
          { id: 'script_1_line_2', text: 'Second line' },
          { id: 'kept', text: 'Third' }
        ]
      }
    ])
    for (const script of result.scripts) {
      expect(scriptSchema.safeParse(script).success).toBe(true)
    }
  })

  it('gives a script with no usable name a default title', () => {
    const result = migrateV8ToV9({
      schemaVersion: 8,
      scripts: [{ id: 's1', name: '  ', lines: [] }]
    }) as {
      scripts: { title: string }[]
    }
    expect(result.scripts[0].title).toBe('Untitled')
  })

  it('adds nothing when a project has no scripts list', () => {
    const result = migrateV8ToV9({ schemaVersion: 8 }) as {
      schemaVersion: number
      scripts?: unknown
    }
    expect(result.schemaVersion).toBe(9)
    expect(result.scripts).toBeUndefined()
  })

  it('rejects a script with no id and a file that is not an object', () => {
    expect(() => migrateV8ToV9({ scripts: [{ name: 'No id', lines: [] }] })).toThrow(
      'script 1 has no "id"'
    )
    expect(() => migrateV8ToV9([])).toThrow('the file is not a JSON object')
  })
})
