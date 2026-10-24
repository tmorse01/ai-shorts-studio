import type { DragEvent, JSX, KeyboardEvent } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import { IconButton } from '@renderer/ui/IconButton'
import styles from './ScriptLineRow.module.css'

export interface ScriptLineRowProps {
  index: number
  lineCount: number
  text: string
  onChangeText: (text: string) => void
  onRemove: () => void
  // Called with the line's new index when the user moves it with Alt+Up or Alt+Down.
  onMove: (toIndex: number) => void
  onDragStart: () => void
  onDropHere: () => void
}

// One numbered line of a script. The grip handle drags the line to a new place. Alt+Up and Alt+Down
// move the focused line from the keyboard.
export function ScriptLineRow({
  index,
  lineCount,
  text,
  onChangeText,
  onRemove,
  onMove,
  onDragStart,
  onDropHere
}: ScriptLineRowProps): JSX.Element {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? -1 : 1
    const target = Math.min(Math.max(index + delta, 0), lineCount - 1)
    if (target !== index) onMove(target)
  }

  function onHandleDragStart(event: DragEvent<HTMLSpanElement>) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
    onDragStart()
  }

  return (
    <li
      className={styles.row}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onDropHere()
      }}
    >
      <span
        className={styles.handle}
        draggable
        onDragStart={onHandleDragStart}
        title="Drag to reorder"
        aria-hidden="true"
      >
        <GripVertical size={16} strokeWidth={1.75} />
      </span>
      <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
      <textarea
        className={styles.text}
        aria-label={`Line ${index + 1}`}
        value={text}
        rows={2}
        placeholder="Write the line"
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <IconButton icon={Trash2} label={`Remove line ${index + 1}`} onClick={onRemove} />
    </li>
  )
}
