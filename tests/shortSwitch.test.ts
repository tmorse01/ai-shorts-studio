import { describe, expect, it } from 'vitest'
import type { Short } from '@shared/project/schema'
import { createHistoryRegistry } from '@renderer/features/history/historyRegistry'
import {
  switcherEntries,
  switchToShort,
  type SwitchDeps
} from '@renderer/features/shorts/shortSwitch'

function short(id: string, patch: Partial<Short>): Short {
  return {
    id,
    name: `Name ${id}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: { tracks: [] },
    ...patch
  }
}

function fakeDeps(calls: string[], saveFailed = false): SwitchDeps {
  return {
    flush: async () => {
      calls.push('flush')
    },
    hasSaveError: () => saveFailed,
    navigate: (id) => calls.push(`navigate:${id}`),
    onSaveFailed: () => calls.push('saveFailed')
  }
}

describe('switcherEntries', () => {
  it('lists shorts in grid order with their status label', () => {
    const entries = switcherEntries([
      short('c', { order: 2, status: 'exported' }),
      short('a', { order: 0, status: 'draft' }),
      short('b', { order: 1, status: 'ready' })
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(entries.map((entry) => entry.statusLabel)).toEqual(['Draft', 'Ready', 'Exported'])
    expect(entries[1].name).toBe('Name b')
  })
})

describe('switchToShort', () => {
  it('does nothing when the target is the short already open', async () => {
    const calls: string[] = []
    const moved = await switchToShort('a', 'a', fakeDeps(calls))
    expect(moved).toBe(false)
    expect(calls).toEqual([])
  })

  it('saves pending edits before navigating to the next short', async () => {
    const calls: string[] = []
    const moved = await switchToShort('a', 'b', fakeDeps(calls))
    expect(moved).toBe(true)
    expect(calls).toEqual(['flush', 'navigate:b'])
  })

  it('stays on the current short when the save fails', async () => {
    const calls: string[] = []
    const moved = await switchToShort('a', 'b', fakeDeps(calls, true))
    expect(moved).toBe(false)
    expect(calls).toEqual(['flush', 'saveFailed'])
  })
})

describe('per-short undo history across switches', () => {
  it('keeps each short its own undo steps when the active short changes', () => {
    const registry = createHistoryRegistry<{ title: string }>({
      createInitial: () => ({ title: 'start' })
    })

    registry.selection.getState().setActive('a')
    registry
      .active()
      ?.getState()
      .execute({
        label: 'Edit a',
        produce: (draft) => {
          draft.title = 'a edited'
        }
      })

    registry.selection.getState().setActive('b')
    expect(registry.active()?.getState().past).toHaveLength(0)

    registry.selection.getState().setActive('a')
    expect(registry.active()?.getState().past).toHaveLength(1)
    expect(registry.active()?.getState().present.title).toBe('a edited')
  })
})
