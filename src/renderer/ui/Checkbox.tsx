import * as RadixCheckbox from '@radix-ui/react-checkbox'
import type { ReactNode } from 'react'
import styles from './ui.module.css'

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  children: ReactNode
}

/** Checkbox with its label. The whole row is the click target. */
export function Checkbox({ checked, onChange, disabled, children }: CheckboxProps) {
  return (
    <label className={styles.checkRow} data-disabled={disabled || undefined}>
      <RadixCheckbox.Root
        className={styles.checkBox}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      >
        <RadixCheckbox.Indicator className={styles.checkMark}>✓</RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span>{children}</span>
    </label>
  )
}
