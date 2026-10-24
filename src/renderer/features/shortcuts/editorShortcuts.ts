import { editorHistory } from '@renderer/features/history/editorHistory'
import { uiStore } from '@renderer/features/layout/useUiStore'
import type { PaneId } from '@shared/layout'
import { shortcutHelpStore } from './shortcutHelpStore'
import type { ShortcutDefinition, ShortcutRegistry } from './shortcutRegistry'

function togglePane(pane: PaneId, label: string, key: string): ShortcutDefinition {
  return {
    id: `pane.toggle.${pane}`,
    keys: [`mod+alt+${key}`],
    label,
    group: 'Panes',
    run: () => uiStore.getState().togglePane(pane)
  }
}

// The editor's built-in shortcuts. Not rebindable yet.
export function editorShortcuts(): ShortcutDefinition[] {
  return [
    {
      id: 'history.undo',
      keys: ['mod+z'],
      label: 'Undo',
      group: 'Edit',
      run: () => editorHistory.active()?.getState().undo()
    },
    {
      id: 'history.redo',
      keys: ['mod+shift+z', 'mod+y'],
      label: 'Redo',
      group: 'Edit',
      run: () => editorHistory.active()?.getState().redo()
    },
    togglePane('left', 'Toggle left panel', '1'),
    togglePane('right', 'Toggle right panel', '2'),
    togglePane('bottom', 'Toggle timeline', '3'),
    {
      id: 'help.show',
      keys: ['shift+?'],
      label: 'Show keyboard shortcuts',
      group: 'Help',
      run: () => shortcutHelpStore.getState().setOpen(true)
    }
  ]
}

// Registers the editor shortcuts and returns a function that removes them all.
export function registerEditorShortcuts(registry: ShortcutRegistry): () => void {
  const unregister = editorShortcuts().map((shortcut) => registry.register(shortcut))
  return () => unregister.forEach((remove) => remove())
}
