import * as RadixSwitch from '@radix-ui/react-switch'
import type { ReactNode } from 'react'
import styles from './ui.module.css'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  children: ReactNode
}

/** On/off setting with its label. Use for settings that take effect when the short is exported. */
export function Switch({ checked, onChange, disabled, children }: SwitchProps) {
  return (
    <label className={styles.checkRow} data-disabled={disabled || undefined}>
      <RadixSwitch.Root className={styles.switch} checked={checked} disabled={disabled} onCheckedChange={onChange}>
        <RadixSwitch.Thumb className={styles.switchThumb} />
      </RadixSwitch.Root>
      <span>{children}</span>
    </label>
  )
}
