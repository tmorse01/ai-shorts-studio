import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import styles from './MenuBar.module.css'

export type MenuEntry =
  | {
      type: 'item'
      label: string
      /** Shown right-aligned, e.g. "Ctrl+N". The shortcut itself is wired in App. */
      shortcut?: string
      checked?: boolean
      disabled?: boolean
      danger?: boolean
      onSelect: () => void
    }
  | { type: 'separator' }
  | { type: 'submenu'; label: string; entries: MenuEntry[] }

export interface MenuDef {
  label: string
  entries: MenuEntry[]
}

/**
 * Application menus in the title bar, in the File / Project / Tools style of desktop editors. Each menu
 * is a Radix dropdown, so keyboard navigation and focus return come for free.
 */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  return (
    <nav className={styles.bar} aria-label="Application menu">
      {menus.map((menu) => (
        <DropdownMenu.Root key={menu.label}>
          <DropdownMenu.Trigger className={styles.trigger}>{menu.label}</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} sideOffset={4} align="start">
              <Entries entries={menu.entries} />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ))}
    </nav>
  )
}

function Entries({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((entry, i) => {
        if (entry.type === 'separator') {
          return <DropdownMenu.Separator key={`sep-${i}`} className={styles.separator} />
        }
        if (entry.type === 'submenu') {
          return (
            <DropdownMenu.Sub key={`sub-${i}`}>
              <DropdownMenu.SubTrigger className={styles.item}>
                <span className={styles.check} aria-hidden="true" />
                <span className={styles.label}>{entry.label}</span>
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={styles.menu} sideOffset={4} alignOffset={-4}>
                  <Entries entries={entry.entries} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          )
        }
        return (
          <DropdownMenu.Item
            key={`item-${i}`}
            disabled={entry.disabled}
            className={`${styles.item} ${entry.danger ? styles.danger : ''}`}
            onSelect={entry.onSelect}
          >
            <span className={styles.check} aria-hidden="true">
              {entry.checked ? '✓' : ''}
            </span>
            <span className={styles.label}>{entry.label}</span>
            {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
          </DropdownMenu.Item>
        )
      })}
    </>
  )
}
