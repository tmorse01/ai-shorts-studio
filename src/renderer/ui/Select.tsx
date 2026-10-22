import * as RadixSelect from '@radix-ui/react-select'
import styles from './ui.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}

/** Branded select with a visible label. Replaces the native dropdown so the open list matches the theme. */
export function Select({ label, value, options, onChange }: SelectProps) {
  const current = options.find((o) => o.value === value)
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger className={styles.selectTrigger} aria-label={label}>
          <RadixSelect.Value>{current?.label ?? value}</RadixSelect.Value>
          <RadixSelect.Icon className={styles.chevron}>⌄</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className={styles.selectContent} position="popper" sideOffset={4}>
            <RadixSelect.Viewport>
              {options.map((o) => (
                <RadixSelect.Item key={o.value} value={o.value} className={styles.selectItem}>
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  )
}
