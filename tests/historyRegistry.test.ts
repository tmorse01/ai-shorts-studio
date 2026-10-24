import { describe, expect, it } from 'vitest'
import { createHistoryRegistry } from '@renderer/features/history/historyRegistry'
import type { Command } from '@renderer/features/history/historyStore'

interface ShortDoc {
  title: string
}

function rename(title: string): Command<ShortDoc> {
  return {
    label: 'Rename',
    produce: (draft) => {
      draft.title = title
    }
  }
}

function createRegistry() {
  return createHistoryRegistry<ShortDoc>({
    createInitial: (id) => ({ title: `Short ${id}` })
  })
}

describe('history registry', () => {
  it('has no active history until one is selected', () => {
    const registry = createRegistry()
    expect(registry.selection.getState().activeId).toBeNull()
    expect(registry.active()).toBeNull()
  })

  it('creates a history per id from the initial state, on first use', () => {
    const registry = createRegistry()
    expect(registry.has('a')).toBe(false)
    expect(registry.get('a').getState().present).toEqual({ title: 'Short a' })
    expect(registry.has('a')).toBe(true)
    expect(registry.get('a')).toBe(registry.get('a'))
  })

  it('keeps each short undo stack separate and switches with the active short', () => {
    const registry = createRegistry()
    registry.selection.getState().setActive('a')
    registry.active()?.getState().execute(rename('A1'))
    registry.active()?.getState().execute(rename('A2'))

    registry.selection.getState().setActive('b')
    expect(registry.active()?.getState().past).toHaveLength(0)
    expect(registry.active()?.getState().undo()).toBe(false)
    registry.active()?.getState().execute(rename('B1'))

    registry.selection.getState().setActive('a')
    expect(registry.active()?.getState().present.title).toBe('A2')
    expect(registry.active()?.getState().past).toHaveLength(2)
    registry.active()?.getState().undo()
    expect(registry.active()?.getState().present.title).toBe('A1')

    expect(registry.get('b').getState().present.title).toBe('B1')
    expect(registry.get('b').getState().past).toHaveLength(1)
  })

  it('drops a removed short and clears the selection when it was active', () => {
    const registry = createRegistry()
    registry.selection.getState().setActive('a')
    registry.active()?.getState().execute(rename('A1'))

    registry.remove('a')
    expect(registry.has('a')).toBe(false)
    expect(registry.selection.getState().activeId).toBeNull()
    expect(registry.active()).toBeNull()
  })

  it('removing an inactive short leaves the active selection alone', () => {
    const registry = createRegistry()
    registry.selection.getState().setActive('a')
    registry.get('a')
    registry.get('b')
    registry.remove('b')
    expect(registry.selection.getState().activeId).toBe('a')
    expect(registry.ids()).toEqual(['a'])
  })

  it('applies the configured limit to every short history', () => {
    const registry = createHistoryRegistry<ShortDoc>({
      createInitial: (id) => ({ title: id }),
      limit: 1
    })
    registry.get('a').getState().execute(rename('1'))
    registry.get('a').getState().execute(rename('2'))
    expect(registry.get('a').getState().past).toHaveLength(1)
  })
})

describe('history registry clear', () => {
  it('drops every history and clears the active selection', () => {
    const registry = createRegistry()
    registry.get('a').getState().execute(rename('1'))
    registry.get('b')
    registry.selection.getState().setActive('a')

    registry.clear()

    expect(registry.ids()).toEqual([])
    expect(registry.selection.getState().activeId).toBeNull()
    expect(registry.active()).toBeNull()
  })
})
