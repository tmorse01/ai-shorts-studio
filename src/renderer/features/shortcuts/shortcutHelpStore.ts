// Whether the shortcuts dialog is open. Both the toolbar button and the '?' shortcut open it.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface ShortcutHelpState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const shortcutHelpStore = createStore<ShortcutHelpState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open })
}))

export function useShortcutHelp<T>(selector: (state: ShortcutHelpState) => T): T {
  return useStore(shortcutHelpStore, selector)
}
