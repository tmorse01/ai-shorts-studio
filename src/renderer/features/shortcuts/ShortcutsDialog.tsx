import { Dialog } from '@renderer/ui/Dialog'
import { useShortcutHelp } from './shortcutHelpStore'
import { formatBinding, shortcutRegistry, type ShortcutDefinition } from './shortcutRegistry'
import styles from './ShortcutsDialog.module.css'

// Groups in the order their first shortcut was registered.
function groupShortcuts(shortcuts: ShortcutDefinition[]): [string, ShortcutDefinition[]][] {
  const groups = new Map<string, ShortcutDefinition[]>()
  for (const shortcut of shortcuts) {
    const group = groups.get(shortcut.group) ?? []
    group.push(shortcut)
    groups.set(shortcut.group, group)
  }
  return [...groups.entries()]
}

// Lists every registered shortcut by group. The rows come from the registry, so a shortcut shows
// here once it is registered.
export function ShortcutsDialog() {
  const open = useShortcutHelp((s) => s.open)
  const setOpen = useShortcutHelp((s) => s.setOpen)
  const groups = groupShortcuts(shortcutRegistry.list())

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Keyboard shortcuts"
      description="Shortcuts work in the editor. They are paused while you type in a field."
    >
      {groups.map(([group, shortcuts]) => (
        <section key={group} className={styles.group}>
          <h3 className={styles.groupTitle}>{group}</h3>
          <ul className={styles.list}>
            {shortcuts.map((shortcut) => (
              <li key={shortcut.id} className={styles.row}>
                <span className={styles.label}>{shortcut.label}</span>
                <span className={styles.keys}>
                  {shortcut.keys.map((binding) => (
                    <kbd key={binding} className={styles.kbd}>
                      {formatBinding(binding)}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  )
}
