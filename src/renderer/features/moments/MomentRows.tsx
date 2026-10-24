// The saved moments of one source clip, listed under it in the media panel. Double-click opens the
// moment in the source viewer with its range marked. Rename, delete and retag are project commands,
// so each can be undone. Moments made by AI (createdBy: ai) carry the lavender accent.
import { useState, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import { Pencil, Tag, Trash2 } from 'lucide-react'
import type { Moment, Project } from '@shared/project/schema'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { applyProjectCommand } from '../shorts/shortActions'
import { sourceStore } from '../source/sourceStore'
import { toast } from '../toasts/toast'
import { allMediaTags } from '../media/mediaTags'
import { deleteMomentCommand, renameMomentCommand, retagMomentCommand } from './momentCommands'
import { formatMomentDuration } from './momentView'
import { DRAG_MIME, encodeDragPayload, momentPayload } from '@shared/timeline/dragPayload'
import styles from './MomentRows.module.css'

export interface MomentRowsProps {
  moments: Moment[]
  project: Project
}

export function MomentRows({ moments, project }: MomentRowsProps): JSX.Element {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const tags = allMediaTags(project)

  // Runs one command. A refused change, such as a missing moment, shows as a toast.
  const run = (command: Parameters<typeof applyProjectCommand>[0]) => {
    try {
      applyProjectCommand(command)
    } catch (caught) {
      toast.error({
        title: 'The moment could not be changed',
        details: caught instanceof Error ? caught.message : undefined
      })
    }
  }

  const startRename = (moment: Moment) => {
    setRenamingId(moment.id)
    setRenameText(moment.name)
  }

  const onRenameSubmit = (event: FormEvent, id: string) => {
    event.preventDefault()
    if (renameText.trim() === '') return
    run(renameMomentCommand(id, renameText))
    setRenamingId(null)
  }

  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setRenamingId(null)
    }
  }

  // Adds or removes one tag on a moment. The tag list follows the media tag list.
  const toggleTag = (moment: Moment, tagId: string) => {
    const next = moment.tags.includes(tagId)
      ? moment.tags.filter((id) => id !== tagId)
      : [...moment.tags, tagId]
    run(retagMomentCommand(moment.id, next))
  }

  return (
    <ul className={styles.list} aria-label="Moments">
      {moments.map((moment) => {
        const ai = moment.createdBy === 'ai'
        const chips = tags.filter((tag) => moment.tags.includes(tag.id))
        return (
          <li
            key={moment.id}
            className={`${styles.moment} ${ai ? styles.ai : ''}`}
            data-created-by={moment.createdBy}
            title="Double-click to open in the source viewer. Drag onto the timeline."
            draggable={renamingId !== moment.id}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, encodeDragPayload(momentPayload(moment)))
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onDoubleClick={() => {
              if (renamingId === moment.id) return
              sourceStore.getState().openRange(moment.mediaId, moment.inMs, moment.outMs)
            }}
          >
            <div className={styles.row}>
              {renamingId === moment.id ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(event) => onRenameSubmit(event, moment.id)}
                >
                  <Input
                    autoFocus
                    aria-label="Moment name"
                    value={renameText}
                    onChange={(event) => setRenameText(event.target.value)}
                    onKeyDown={onRenameKeyDown}
                    onBlur={() => setRenamingId(null)}
                  />
                </form>
              ) : (
                <span className={styles.name}>{moment.name}</span>
              )}
              {ai ? <span className={styles.aiLabel}>AI</span> : null}
              <span className={styles.meta}>
                {formatMomentDuration(moment.outMs - moment.inMs)}
              </span>
              <IconButton
                icon={Tag}
                label="Edit tags"
                aria-pressed={taggingId === moment.id}
                onClick={() => setTaggingId(taggingId === moment.id ? null : moment.id)}
              />
              <IconButton icon={Pencil} label="Rename moment" onClick={() => startRename(moment)} />
              <IconButton
                icon={Trash2}
                label="Delete moment"
                onClick={() => run(deleteMomentCommand(moment.id))}
              />
            </div>
            {taggingId === moment.id ? (
              <div className={styles.tags} role="group" aria-label="Tags on this moment">
                {tags.map((tag) => {
                  const on = moment.tags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={on}
                      className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                      onClick={() => toggleTag(moment, tag.id)}
                    >
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            ) : chips.length > 0 ? (
              <div className={styles.tags}>
                {chips.map((tag) => (
                  <span key={tag.id} className={styles.chip}>
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
