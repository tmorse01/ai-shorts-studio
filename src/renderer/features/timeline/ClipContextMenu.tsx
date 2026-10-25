import type { JSX } from 'react'
import { DropdownMenu, type DropdownMenuItem } from '@renderer/ui/DropdownMenu'
import styles from './ClipContextMenu.module.css'

export interface ClipContextMenuProps {
  // The viewport point the menu opens at: the pointer for a right-click, the clip's corner for the keyboard.
  anchor: { x: number; y: number }
  items: DropdownMenuItem[]
  onClose: () => void
}

// The menu of one clip, open at a point. It is controlled: it stays open until an item is chosen or
// the menu is dismissed, and then reports onClose.
export function ClipContextMenu({ anchor, items, onClose }: ClipContextMenuProps): JSX.Element {
  return (
    <DropdownMenu
      trigger={
        <span
          className={styles.anchor}
          data-testid="clip-context-menu-anchor"
          style={{ left: anchor.x, top: anchor.y }}
        />
      }
      items={items}
      align="start"
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    />
  )
}
