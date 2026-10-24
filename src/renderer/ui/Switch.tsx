import type { ReactNode } from 'react'
import * as RadixSwitch from '@radix-ui/react-switch'
import styles from './Switch.module.css'

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  children: ReactNode
}

/** A labelled on/off switch. The label is the visible text next to the track. */
export function Switch({ children, ...rest }: SwitchProps) {
  return (
    <label className={styles.row}>
      <RadixSwitch.Root className={styles.root} {...rest}>
        <RadixSwitch.Thumb className={styles.thumb} />
      </RadixSwitch.Root>
      <span className={styles.label}>{children}</span>
    </label>
  )
}
