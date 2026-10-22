import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactElement } from 'react'
import styles from './ui.module.css'

/** Tooltip for icon-only controls. Needs a Tooltip.Provider higher up, which main.tsx supplies. */
export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root delayDuration={400}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles.tip} sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
