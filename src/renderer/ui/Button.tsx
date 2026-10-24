import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ai' | 'destructive' | 'ghost'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks clicks until the action finishes. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref
) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className={styles.spinner} size={14} aria-hidden="true" />}
      {children}
    </button>
  )
})
