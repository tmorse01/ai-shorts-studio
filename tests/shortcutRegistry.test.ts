import { describe, expect, it, vi } from 'vitest'
import {
  createShortcutRegistry,
  formatBinding,
  isEditableTarget,
  parseBinding,
  type KeyPress
} from '@renderer/features/shortcuts/shortcutRegistry'
import { registerEditorShortcuts } from '@renderer/features/shortcuts/editorShortcuts'
import { shortcutHelpStore } from '@renderer/features/shortcuts/shortcutHelpStore'
import { uiStore } from '@renderer/features/layout/useUiStore'

function press(key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers }
}

describe('parseBinding', () => {
  it('reads modifiers and a lower-case key', () => {
    expect(parseBinding('mod+shift+Z')).toEqual({ key: 'z', mod: true, shift: true, alt: false })
  })

  it('rejects an unknown modifier and a missing key', () => {
    expect(() => parseBinding('ctrl+z')).toThrow(/Unknown modifier "ctrl"/)
    expect(() => parseBinding('mod+')).toThrow(/has no key/)
  })
})

describe('createShortcutRegistry', () => {
  it('runs a shortcut for its binding, with Ctrl or Cmd standing for mod', () => {
    const registry = createShortcutRegistry()
    const run = vi.fn()
    registry.register({ id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', run })

    expect(registry.handle(press('z', { ctrlKey: true }))).toBe(true)
    expect(registry.handle(press('z', { metaKey: true }))).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('needs every modifier to match, so Ctrl+Z does not fire for Ctrl+Shift+Z', () => {
    const registry = createShortcutRegistry()
    const run = vi.fn()
    registry.register({ id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', run })

    expect(registry.handle(press('Z', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(registry.handle(press('z', { ctrlKey: true, altKey: true }))).toBe(false)
    expect(registry.handle(press('z'))).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('runs a shortcut from any of its bindings', () => {
    const registry = createShortcutRegistry()
    const run = vi.fn()
    registry.register({
      id: 'redo',
      keys: ['mod+shift+z', 'mod+y'],
      label: 'Redo',
      group: 'Edit',
      run
    })

    expect(registry.handle(press('Z', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(registry.handle(press('y', { ctrlKey: true }))).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('ignores keystrokes that come from an editable field', () => {
    const registry = createShortcutRegistry()
    const run = vi.fn()
    registry.register({ id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', run })

    expect(registry.handle(press('z', { ctrlKey: true }), { editable: true })).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('stops after the first shortcut that matches', () => {
    const registry = createShortcutRegistry()
    const first = vi.fn()
    const second = vi.fn()
    registry.register({ id: 'a', keys: ['mod+k'], label: 'A', group: 'G', run: first })
    registry.register({ id: 'b', keys: ['mod+k'], label: 'B', group: 'G', run: second })

    registry.handle(press('k', { ctrlKey: true }))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('removes a shortcut when its unregister function runs', () => {
    const registry = createShortcutRegistry()
    const run = vi.fn()
    const unregister = registry.register({
      id: 'undo',
      keys: ['mod+z'],
      label: 'Undo',
      group: 'Edit',
      run
    })

    unregister()
    expect(registry.list()).toEqual([])
    expect(registry.handle(press('z', { ctrlKey: true }))).toBe(false)
  })

  it('refuses a second shortcut with the same id', () => {
    const registry = createShortcutRegistry()
    const shortcut = { id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', run: () => {} }
    registry.register(shortcut)
    expect(() => registry.register(shortcut)).toThrow(/already registered/)
  })

  it('lists shortcuts in registration order', () => {
    const registry = createShortcutRegistry()
    registry.register({ id: 'b', keys: ['alt+b'], label: 'B', group: 'G', run: () => {} })
    registry.register({ id: 'a', keys: ['alt+a'], label: 'A', group: 'G', run: () => {} })
    expect(registry.list().map((shortcut) => shortcut.id)).toEqual(['b', 'a'])
  })
})

describe('isEditableTarget', () => {
  it('is true for text fields and contenteditable elements only', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('formatBinding', () => {
  it('spells modifiers out for the shortcuts dialog', () => {
    expect(formatBinding('mod+shift+z')).toBe('Ctrl + Shift + Z')
    expect(formatBinding('shift+?')).toBe('Shift + ?')
  })
})

describe('editor shortcuts', () => {
  it('toggles a pane from its shortcut', () => {
    const registry = createShortcutRegistry()
    const unregister = registerEditorShortcuts(registry)

    const before = uiStore.getState().panes.bottom.collapsed
    expect(registry.handle(press('3', { ctrlKey: true, altKey: true }))).toBe(true)
    expect(uiStore.getState().panes.bottom.collapsed).toBe(!before)

    uiStore.getState().togglePane('bottom')
    unregister()
  })

  it('opens the shortcuts dialog from the ? key', () => {
    const registry = createShortcutRegistry()
    const unregister = registerEditorShortcuts(registry)

    shortcutHelpStore.getState().setOpen(false)
    expect(registry.handle(press('?', { shiftKey: true }))).toBe(true)
    expect(shortcutHelpStore.getState().open).toBe(true)

    shortcutHelpStore.getState().setOpen(false)
    unregister()
  })

  it('lists every editor shortcut by group and removes them all on cleanup', () => {
    const registry = createShortcutRegistry()
    const unregister = registerEditorShortcuts(registry)

    const groups = new Set(registry.list().map((shortcut) => shortcut.group))
    expect(groups).toEqual(new Set(['Edit', 'Panes', 'Help']))

    unregister()
    expect(registry.list()).toEqual([])
  })
})
