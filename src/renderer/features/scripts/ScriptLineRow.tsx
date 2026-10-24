import type { DragEvent, JSX, KeyboardEvent } from 'react'
import { GripVertical, Loader2, Sparkles, Trash2 } from 'lucide-react'
import {
  LINE_REWRITE_ACTIONS,
  LINE_REWRITE_ACTION_LABELS,
  type LineRewriteAction
} from '@shared/ai/lineRewrite'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
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
  // AI line actions. A rewrite is only previewed here; Accept saves it as one undoable command.
  onRewrite: (action: LineRewriteAction) => void
  rewriting: boolean
  // The previewed rewrite for this line, and the action that produced it. Null when there is none.
  suggestion: { text: string; action: LineRewriteAction } | null
  onAcceptSuggestion: () => void
  onDiscardSuggestion: () => void
}

// One numbered line of a script. The grip handle drags the line to a new place. Alt+Up and Alt+Down
// move the focused line from the keyboard. The sparkle menu asks for an AI rewrite and previews it.
export function ScriptLineRow({
  index,
  lineCount,
  text,
  onChangeText,
  onRemove,
  onMove,
  onDragStart,
  onDropHere,
  onRewrite,
  rewriting,
  suggestion,
  onAcceptSuggestion,
  onDiscardSuggestion
}: ScriptLineRowProps): JSX.Element {
  const empty = text.trim() === ''

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
      <div className={styles.actions}>
        <DropdownMenu
          align="end"
          trigger={
            <IconButton
              icon={rewriting ? Loader2 : Sparkles}
              label={rewriting ? `Rewriting line ${index + 1}` : `AI actions for line ${index + 1}`}
              disabled={rewriting || empty}
            />
          }
          items={LINE_REWRITE_ACTIONS.map((action) => ({
            label: LINE_REWRITE_ACTION_LABELS[action],
            onSelect: () => onRewrite(action)
          }))}
        />
        <IconButton icon={Trash2} label={`Remove line ${index + 1}`} onClick={onRemove} />
      </div>

      {suggestion && (
        <div
          className={styles.suggestion}
          role="group"
          aria-label={`Suggestion for line ${index + 1}`}
        >
          <span className={styles.suggestionLabel}>
            AI suggestion · {LINE_REWRITE_ACTION_LABELS[suggestion.action]}
          </span>
          <p className={styles.suggestionText}>{suggestion.text}</p>
          <div className={styles.suggestionActions}>
            <Button variant="ghost" size="sm" onClick={onDiscardSuggestion}>
              Discard
            </Button>
            <Button variant="ai" size="sm" onClick={onAcceptSuggestion}>
              Accept
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
