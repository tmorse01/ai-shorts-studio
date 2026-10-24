import { useEffect, useState, type JSX } from 'react'
import { formatFieldTimecode, MIXED_VALUE, parseFieldTimecode } from './fieldMath'
import { Input } from './Input'

export interface TimecodeFieldProps {
  label: string
  valueMs: number
  mixed?: boolean
  onChange: (ms: number) => void
}

// An mm:ss.ff field. Enter or leaving the field commits a valid value. An invalid entry reverts.
export function TimecodeField({
  label,
  valueMs,
  mixed,
  onChange
}: TimecodeFieldProps): JSX.Element {
  const shown = mixed ? MIXED_VALUE : formatFieldTimecode(valueMs)
  const [text, setText] = useState(shown)

  useEffect(() => setText(shown), [shown])

  function commit() {
    const parsed = parseFieldTimecode(text)
    if (parsed === null) {
      setText(shown)
      return
    }
    onChange(parsed)
  }

  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') setText(shown)
      }}
    />
  )
}
