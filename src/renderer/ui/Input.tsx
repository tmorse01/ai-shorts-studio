import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './Input.module.css'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref
) {
  const classes = [styles.input, className].filter(Boolean).join(' ')
  return <input ref={ref} className={classes} {...rest} />
})
