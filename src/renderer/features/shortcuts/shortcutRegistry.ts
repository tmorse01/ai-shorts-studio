// Keyboard shortcut registry. Features register a shortcut as { id, keys, label, group, run }; the
// app listens for keydown once and runs the first shortcut whose binding matches. Bindings are
// fixed strings such as 'mod+shift+z': 'mod' is Ctrl (or Cmd), and every modifier must match
// exactly, so Ctrl+Z does not fire for Ctrl+Shift+Z. Keystrokes typed into a field are ignored.

export interface ShortcutDefinition {
  id: string
  // One or more bindings. Several bindings can run the same shortcut (Ctrl+Y and Ctrl+Shift+Z).
  keys: string[]
  // Plain-language name, shown in the shortcuts dialog.
  label: string
  // Heading the shortcut is listed under in the shortcuts dialog.
  group: string
  run: () => void
}

// The parts of a keydown event the registry reads. A KeyboardEvent satisfies it.
export interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface ShortcutRegistry {
  // Adds a shortcut and returns a function that removes it. Ids must be unique.
  register: (shortcut: ShortcutDefinition) => () => void
  // Registered shortcuts, in the order they were registered.
  list: () => ShortcutDefinition[]
  // Runs the first shortcut bound to the press. Returns false when none matched or the press came
  // from an editable field, so the caller leaves the event alone.
  handle: (press: KeyPress, options?: { editable?: boolean }) => boolean
}

interface ParsedBinding {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

const MODIFIERS = new Set(['mod', 'shift', 'alt'])

// Throws on an unknown modifier or a missing key, so a bad binding fails when it is registered.
export function parseBinding(binding: string): ParsedBinding {
  const parts = binding.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  if (!key) throw new Error(`Shortcut binding has no key: "${binding}"`)

  const parsed: ParsedBinding = { key, mod: false, shift: false, alt: false }
  for (const modifier of parts.slice(0, -1)) {
    if (!MODIFIERS.has(modifier)) {
      throw new Error(`Unknown modifier "${modifier}" in shortcut binding "${binding}"`)
    }
    if (modifier === 'mod') parsed.mod = true
    if (modifier === 'shift') parsed.shift = true
    if (modifier === 'alt') parsed.alt = true
  }
  return parsed
}

function matches(binding: ParsedBinding, press: KeyPress): boolean {
  return (
    binding.key === press.key.toLowerCase() &&
    binding.mod === (press.ctrlKey || press.metaKey) &&
    binding.shift === press.shiftKey &&
    binding.alt === press.altKey
  )
}

// Editable fields keep their own keys: typing, and native undo inside a text box.
export function isEditableTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false
  const { tagName, isContentEditable, type } = target as {
    tagName?: unknown
    isContentEditable?: unknown
    type?: unknown
  }
  if (isContentEditable === true) return true
  // Inputs that take no typed text (range sliders, checkboxes, buttons) must not block shortcuts.
  if (tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES.has(String(type))
  return typeof tagName === 'string' && ['TEXTAREA', 'SELECT'].includes(tagName)
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit'
])

export function createShortcutRegistry(): ShortcutRegistry {
  const entries = new Map<string, { shortcut: ShortcutDefinition; bindings: ParsedBinding[] }>()

  return {
    register: (shortcut) => {
      if (entries.has(shortcut.id)) {
        throw new Error(`Shortcut "${shortcut.id}" is already registered`)
      }
      const entry = { shortcut, bindings: shortcut.keys.map(parseBinding) }
      entries.set(shortcut.id, entry)
      return () => {
        if (entries.get(shortcut.id) === entry) entries.delete(shortcut.id)
      }
    },
    list: () => [...entries.values()].map((entry) => entry.shortcut),
    handle: (press, options) => {
      if (options?.editable) return false
      for (const { shortcut, bindings } of entries.values()) {
        if (bindings.some((binding) => matches(binding, press))) {
          shortcut.run()
          return true
        }
      }
      return false
    }
  }
}

// Shown in the shortcuts dialog: 'mod+shift+z' becomes 'Ctrl + Shift + Z'.
export function formatBinding(binding: string): string {
  return binding
    .split('+')
    .map((part) => {
      if (part === 'mod') return 'Ctrl'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'delete') return 'Delete'
      if (part === 'backspace') return 'Backspace'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join(' + ')
}

// The app's registry. Mounted once by the app shell (see useShortcutListener).
export const shortcutRegistry = createShortcutRegistry()
