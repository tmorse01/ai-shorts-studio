import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Required when there is no visible label next to the select. */
  'aria-label'?: string
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  'aria-label': ariaLabel
}: SelectProps) {
  return (
    <RadixSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <RadixSelect.Trigger className={styles.trigger} aria-label={ariaLabel}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon asChild>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={4}>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={styles.item}
              >
                <RadixSelect.ItemIndicator className={styles.indicator}>
                  <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
