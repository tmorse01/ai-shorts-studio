// Saves the marked In and Out range of the source clip as a moment. The button, or M, opens an inline
// name prompt. Enter saves, Escape cancels. The save is one undoable project command.
import { useState, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import { useStore } from 'zustand'
import { GripVertical } from 'lucide-react'
import { markedRange } from '@shared/media/sourceMarks'
import { DRAG_MIME, encodeDragPayload, rangePayload } from '@shared/timeline/dragPayload'
import { Button } from '@renderer/ui/Button'
import { Input } from '@renderer/ui/Input'
import { applyProjectCommand } from '../shorts/shortActions'
import { projectStore } from '../project/projectStore'
import { sourceStore } from '../source/sourceStore'
import { toast } from '../toasts/toast'
import { addMomentCommand } from './momentCommands'
import { defaultMomentName, momentsOfMedia } from './momentView'
import styles from './SaveMomentControl.module.css'

export function SaveMomentControl(): JSX.Element | null {
  const current = useStore(projectStore, (state) => state.current)
  const mode = useStore(sourceStore, (state) => state.mode)
  const sourceId = useStore(sourceStore, (state) => state.sourceId)
  const inMs = useStore(sourceStore, (state) => state.inMs)
  const outMs = useStore(sourceStore, (state) => state.outMs)
  const naming = useStore(sourceStore, (state) => state.naming)
  const [name, setName] = useState('')

  if (!current || mode !== 'source' || sourceId === null) return null
  const range = markedRange({ inMs, outMs })

  const finish = () => {
    setName('')
    sourceStore.getState().cancelNamingMoment()
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!range || sourceId === null) return
    const count = momentsOfMedia(current.project.moments, sourceId).length
    const moment = {
      id: crypto.randomUUID(),
      mediaId: sourceId,
      name: name.trim() || defaultMomentName(count),
      inMs: range.startMs,
      outMs: range.endMs,
      tags: [],
      createdBy: 'user' as const
    }
    try {
      applyProjectCommand(addMomentCommand(moment))
      finish()
    } catch (caught) {
      toast.error({
        title: 'The moment could not be saved',
        details: caught instanceof Error ? caught.message : undefined
      })
    }
  }

  if (!naming) {
    return (
      <span className={styles.group}>
        <button
          type="button"
          className={styles.grip}
          draggable={range !== null}
          disabled={!range}
          aria-label="Drag the marked range to the timeline"
          title="Drag the marked range to the timeline"
          onDragStart={(event) => {
            if (!range) return
            event.dataTransfer.setData(
              DRAG_MIME,
              encodeDragPayload(rangePayload(sourceId, range.startMs, range.endMs))
            )
            event.dataTransfer.effectAllowed = 'copy'
          }}
        >
          <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!range}
          title="Save the In and Out range as a moment (M)"
          onClick={() => sourceStore.getState().startNamingMoment()}
        >
          Save moment
        </Button>
      </span>
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      finish()
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <Input
        autoFocus
        className={styles.input}
        aria-label="Moment name"
        placeholder="Name this moment"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button type="submit" size="sm">
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={finish}>
        Cancel
      </Button>
    </form>
  )
}
