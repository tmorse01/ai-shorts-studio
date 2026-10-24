import { editorHistory } from '@renderer/features/history/editorHistory'
import { redoProjectEdit, undoProjectEdit } from '@renderer/features/shorts/shortActions'
import { uiStore } from '@renderer/features/layout/useUiStore'
import { playbackStore } from '@renderer/features/playback/playbackStore'
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
      // With no short open, undo applies to the project (Project home).
      run: () => {
        const short = editorHistory.active()
        if (short) short.getState().undo()
        else undoProjectEdit()
      }
    },
    {
      id: 'history.redo',
      keys: ['mod+shift+z', 'mod+y'],
      label: 'Redo',
      group: 'Edit',
      run: () => {
        const short = editorHistory.active()
        if (short) short.getState().redo()
        else redoProjectEdit()
      }
    },
    {
      id: 'playback.toggle',
      keys: [' '],
      label: 'Play or pause',
      group: 'Playback',
      run: () => playbackStore.getState().toggle()
    },
    {
      id: 'playback.stepBack',
      keys: ['arrowleft'],
      label: 'Step back one frame',
      group: 'Playback',
      run: () => playbackStore.getState().step(-1)
    },
    {
      id: 'playback.stepForward',
      keys: ['arrowright'],
      label: 'Step forward one frame',
      group: 'Playback',
      run: () => playbackStore.getState().step(1)
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
