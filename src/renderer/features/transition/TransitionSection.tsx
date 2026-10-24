import type { JSX, ReactNode } from 'react'
import { X } from 'lucide-react'
import { TRANSITION_KINDS, TRANSITION_LABELS, kindOf } from '@shared/timeline/transitions'
import type { TransitionKind } from '@shared/timeline/timeline'
import { Button } from '@renderer/ui/Button'
import { Select } from '@renderer/ui/Select'
import { TimecodeField } from '@renderer/ui/TimecodeField'
import { formatFieldTimecode } from '@renderer/ui/fieldMath'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { TransitionTarget } from '../inspector/inspectorStore'
import styles from './TransitionSection.module.css'

// The inspector's transition section (Epic 08, #98), in the Video tab. It shows the kind of the selected
// transition, its length and the longest length its handles allow. Remove transition deletes it. Each
// change is one undoable edit; the length is clamped to the handles by the edit itself.
export function TransitionSection(): JSX.Element {
  const target = useInspectorStore((state) => state.transitionTarget)
  if (!target) {
    return <p className={styles.empty}>Select a transition to see its properties.</p>
  }
  return <TransitionForm key={target.transition.id} target={target} />
}

interface TransitionFormProps {
  target: TransitionTarget
}

function TransitionForm({ target }: TransitionFormProps): JSX.Element {
  const { transition, limitMs, setKind, setDuration, remove } = target
  const options = TRANSITION_KINDS.map((kind) => ({ value: kind, label: TRANSITION_LABELS[kind] }))

  return (
    <div className={styles.body}>
      <Field label="Kind">
        <Select
          aria-label="Transition kind"
          value={kindOf(transition)}
          options={options}
          onValueChange={(value) => setKind(value as TransitionKind)}
        />
      </Field>
      <Field label="Duration">
        <TimecodeField
          label="Transition duration"
          valueMs={transition.durationMs}
          onChange={(ms) => setDuration(ms, `transition-length-${transition.id}`)}
        />
        <span className={styles.hint}>Up to {formatFieldTimecode(limitMs)} on this cut.</span>
      </Field>
      <Button variant="secondary" onClick={remove}>
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
        Remove transition
      </Button>
    </div>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
}

// One labelled row, styled like the video clip rows.
function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
