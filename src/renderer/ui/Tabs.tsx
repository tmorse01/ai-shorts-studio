import type { ReactNode } from 'react'
import * as RadixTabs from '@radix-ui/react-tabs'
import styles from './Tabs.module.css'

export interface TabItem {
  value: string
  label: string
  content: ReactNode
}

export interface TabsProps {
  items: TabItem[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Names the tab list for screen readers. */
  'aria-label': string
}

export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  'aria-label': ariaLabel
}: TabsProps) {
  return (
    <RadixTabs.Root
      className={styles.root}
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
    >
      <RadixTabs.List className={styles.list} aria-label={ariaLabel}>
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value} className={styles.trigger}>
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} className={styles.panel}>
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
