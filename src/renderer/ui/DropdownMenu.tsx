import type { ReactElement } from 'react'
import * as RadixDropdown from '@radix-ui/react-dropdown-menu'
import styles from './DropdownMenu.module.css'

export interface DropdownMenuItem {
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

export interface DropdownMenuProps {
  /** A single element (for example a Button or IconButton) that opens the menu. */
  trigger: ReactElement
  items: DropdownMenuItem[]
  align?: 'start' | 'center' | 'end'
}

export function DropdownMenu({ trigger, items, align = 'end' }: DropdownMenuProps) {
  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>{trigger}</RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content className={styles.content} sideOffset={4} align={align}>
          {items.map((item) => (
            <RadixDropdown.Item
              key={item.label}
              className={item.destructive ? styles.destructiveItem : styles.item}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.label}
            </RadixDropdown.Item>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  )
}
