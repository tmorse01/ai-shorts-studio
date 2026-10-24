import { useEffect, useState, type JSX } from 'react'
import { clamp, formatDb, MIXED_VALUE, parseDb } from './fieldMath'
import { Input } from './Input'
import styles from './SliderNumberField.module.css'

export interface SliderNumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  // Formats the number for the text box, and parses typed text back to a number.
  format: (value: number) => string
  parse: (text: string) => number | null
  mixed?: boolean
  onChange: (value: number) => void
}

// A slider with a number box beside it. A typed value is clamped to the range. Dragging the slider
// calls onChange on each move; the caller merges that drag into one history entry.
export function SliderNumberField({
  label,
  value,
  min,
  max,
  step,
  format,
  parse,
  mixed,
  onChange
}: SliderNumberFieldProps): JSX.Element {
  const shown = mixed ? MIXED_VALUE : format(value)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])

  function commit() {
    const parsed = parse(text)
    if (parsed === null) {
      setText(shown)
      return
    }
    onChange(clamp(parsed, min, max))
  }

  return (
    <div className={styles.row}>
      <input
        type="range"
        className={styles.slider}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={mixed ? min : value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <Input
        className={styles.number}
        aria-label={`${label} value`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setText(shown)
        }}
      />
    </div>
  )
}

// Volume in dB: a slider from -60 to +12 dB with a "dB" number box.
export function DbField(props: {
  label: string
  value: number
  mixed?: boolean
  onChange: (db: number) => void
}): JSX.Element {
  return (
    <SliderNumberField {...props} min={-60} max={12} step={0.5} format={formatDb} parse={parseDb} />
  )
}
