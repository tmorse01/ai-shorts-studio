import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useStore } from 'zustand'
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Placement } from '@shared/compositor/frame'
import type { TextItem } from '@shared/text/textItem'
import { TEXT_FONT_STACKS, TEXT_PALETTE, TEXT_STYLES } from '@shared/text/textStyles'
import { layerFrameStore } from '../compositor/layerFrameStore'
import { applyTextItemEdit } from '../compositor/layerTransformCommands'
import { textEditStore } from './textEditStore'
import styles from './TextEditor.module.css'

export interface TextEditorProps {
  shortId: string
}

// The on-canvas editor for a text overlay (Epic 13, #127). It sits over the text as the preview draws it, and
// opens from a double click. Enter on its own makes a new line; Ctrl+Enter or a click away commits, and Escape
// cancels. A blank text is not committed, since a blank overlay draws nothing.
export function TextEditor({ shortId }: TextEditorProps): JSX.Element | null {
  const clipId = useStore(textEditStore, (state) => state.editingClipId)
  const frame = useStore(layerFrameStore, (state) => state.frame)
  const layer = clipId === null ? undefined : frame?.layers.find((item) => item.clipId === clipId)
  if (clipId === null || !layer?.textItem || !layer.placement) return null
  return (
    <div className={styles.layer}>
      <TextEditorField
        key={clipId}
        shortId={shortId}
        clipId={clipId}
        item={layer.textItem}
        placement={layer.placement}
      />
    </div>
  )
}

interface TextEditorFieldProps {
  shortId: string
  clipId: string
  item: TextItem
  placement: Placement
}

function TextEditorField({ shortId, clipId, item, placement }: TextEditorFieldProps): JSX.Element {
  const [draft, setDraft] = useState(item.text)
  const field = useRef<HTMLTextAreaElement>(null)
  // A commit or a cancel closes the editor once. Blur also fires after a key has closed it.
  const finished = useRef(false)
  const style = TEXT_STYLES[item.styleId]

  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])

  function close(commit: boolean) {
    if (finished.current) return
    finished.current = true
    textEditStore.getState().stop()
    if (!commit || draft.trim() === '' || draft === item.text) return
    applyTextItemEdit(shortId, clipId, 'Edit text', `text-edit:${clipId}`, (current) => ({
      ...current,
      text: draft
    }))
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // The arrow keys edit the text here, not the layer, so the frame must not see them.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      close(false)
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      close(true)
    }
  }

  // The field sits over the text. Font sizes and spacing use container units, so the editor matches the
  // frame at any preview size. A 100 cqw width is the canvas width.
  const width = Math.max(placement.width, CANVAS_WIDTH * 0.3)
  const fieldStyle = {
    left: `${(placement.centerX / CANVAS_WIDTH) * 100}%`,
    top: `${(placement.centerY / CANVAS_HEIGHT) * 100}%`,
    width: `${(width / CANVAS_WIDTH) * 100}%`,
    fontFamily: TEXT_FONT_STACKS[style.font],
    fontWeight: style.weight,
    fontSize: `${(style.sizePx * item.scale * 100) / CANVAS_WIDTH}cqw`,
    letterSpacing: `${(style.letterSpacingPx * item.scale * 100) / CANVAS_WIDTH}cqw`,
    textTransform: style.uppercase ? ('uppercase' as const) : ('none' as const),
    color: TEXT_PALETTE[item.color ?? style.fill]
  }

  return (
    <textarea
      ref={field}
      className={styles.field}
      style={fieldStyle}
      aria-label="Edit text"
      rows={Math.max(1, draft.split('\n').length)}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => close(true)}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
