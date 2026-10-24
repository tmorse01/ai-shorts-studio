import { editorHistory } from '@renderer/features/history/editorHistory'
import { redoProjectEdit, undoProjectEdit } from '@renderer/features/shorts/shortActions'
import { uiStore } from '@renderer/features/layout/useUiStore'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { sourceStore } from '@renderer/features/source/sourceStore'
import { toast } from '@renderer/features/toasts/toast'
import { timelineViewStore } from '@renderer/features/timeline/timelineViewStore'
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
    {
      id: 'playback.shuttleBack',
      keys: ['j'],
      label: 'Play backward (press again to speed up)',
      group: 'Playback',
      run: () => playbackStore.getState().shuttle(-1)
    },
    {
      id: 'playback.pause',
      keys: ['k'],
      label: 'Pause',
      group: 'Playback',
      run: () => playbackStore.getState().pause()
    },
    {
      id: 'playback.shuttleForward',
      keys: ['l'],
      label: 'Play forward (press again to speed up)',
      group: 'Playback',
      run: () => playbackStore.getState().shuttle(1)
    },
    {
      id: 'source.markIn',
      keys: ['i'],
      label: 'Mark In at playhead',
      group: 'Source',
      run: () => sourceStore.getState().markInAtPlayhead()
    },
    {
      id: 'source.markOut',
      keys: ['o'],
      label: 'Mark Out at playhead',
      group: 'Source',
      run: () => sourceStore.getState().markOutAtPlayhead()
    },
    {
      id: 'source.clearMarks',
      keys: ['x'],
      label: 'Clear In and Out marks',
      group: 'Source',
      run: () => sourceStore.getState().clearMarks()
    },
    {
      id: 'source.saveMoment',
      keys: ['m'],
      label: 'Save the In and Out range as a moment',
      group: 'Source',
      run: () => {
        const store = sourceStore.getState()
        if (store.inMs === null || store.outMs === null) {
          toast.info({ title: 'Mark In and Out first' })
          return
        }
        store.startNamingMoment()
      }
    },
    {
      id: 'timeline.toggleSnapping',
      keys: ['n'],
      label: 'Toggle snapping in the timeline',
      group: 'Timeline',
      run: () => timelineViewStore.getState().toggleSnapping()
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
