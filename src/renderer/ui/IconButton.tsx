import { forwardRef, type ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './IconButton.module.css'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon
  /** Required: an icon alone has no text, so the label becomes the accessible name. */
  label: string
  variant?: 'ghost' | 'secondary'
  /** Fills the icon, for a toggled state such as a starred clip. */
  filled?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', filled = false, className, ...rest },
  ref
) {
  const classes = [styles.iconButton, styles[variant], className].filter(Boolean).join(' ')

  return (
    <button ref={ref} type="button" className={classes} aria-label={label} title={label} {...rest}>
      <Icon
        size={16}
        strokeWidth={1.75}
        fill={filled ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  )
})
