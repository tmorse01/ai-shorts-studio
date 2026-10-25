// Caption blocks on the Captions lane (Epic 11, #120). A block can be moved and trimmed by its edges, its
// text edited inline on double click, and split at the playhead or merged with the next block from its
// menu. Each finished gesture is one timeline edit handed to the caller, so it lands in history as one step.
import { useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from 'react'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import {
  editCaptionText,
  mergeCaptionWithNext,
  moveCaptionBlock,
  splitCaptionAtMs,
  trimCaptionBlock
} from '@shared/captions/captionEditing'
import { blockSpanMs } from '@shared/captions/captionTiming'
import { editCaptionBlocks } from '@shared/captions/captionTrack'
import type { Timeline, Track } from '@shared/timeline/timeline'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { Button } from '@renderer/ui/Button'
import { formatTimecode } from '../playback/playbackClock'
import { timeToX } from '../timeline/timelineView'
import { toast } from '../toasts/toast'
import styles from './CaptionBlocks.module.css'

// A press becomes a drag after this much movement, so a click never moves a block.
const DRAG_THRESHOLD_PX = 4

type GestureMode = 'move' | 'start' | 'end'

// The live state of one press on a block. It lives outside React state so the pointer handlers always
// see the latest values.
interface Gesture {
  blockId: string
  mode: GestureMode
  startX: number
  // The time the grabbed edge (or the block start, for a move) sat at when the press began.
  originMs: number
  moved: boolean
  deltaMs: number
}

export interface CaptionBlocksProps {
  track: Track
  pxPerMs: number
  playheadMs: number
  // Id for a block made by a split.
  newId: () => string
  // Runs a timeline edit as one history step. Returns false when the edit changed nothing.
  runEdit: (label: string, edit: (timeline: Timeline) => Timeline) => boolean
}

function blockText(block: CaptionBlock): string {
  return block.words.map((word) => word.text).join(' ')
}

// The blocks as they will look if the gesture drops now. A move or trim that would be invalid shows the
// blocks as they were.
function previewBlocks(
  blocks: readonly CaptionBlock[],
  gesture: Gesture | null
): readonly CaptionBlock[] {
  if (!gesture || !gesture.moved) return blocks
  if (gesture.mode === 'move') return moveCaptionBlock(blocks, gesture.blockId, gesture.deltaMs)
  return trimCaptionBlock(blocks, gesture.blockId, gesture.mode, gesture.originMs + gesture.deltaMs)
}

// The captions lane's blocks, drawn over the lane body.
export function CaptionBlocks({
  track,
  pxPerMs,
  playheadMs,
  newId,
  runEdit
}: CaptionBlocksProps): JSX.Element {
  const blocks = track.captions ?? []
  const locked = track.locked === true
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  // Set once an inline edit has been committed or cancelled, so a blur after Enter does nothing.
  const editSettled = useRef(true)

  const shown = previewBlocks(blocks, gesture)

  function beginGesture(
    event: PointerEvent<HTMLDivElement>,
    block: CaptionBlock,
    mode: GestureMode
  ) {
    if (locked || event.button !== 0 || editingId !== null) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const { startMs, endMs } = blockSpanMs(block)
    const originMs = mode === 'end' ? endMs : startMs
    gestureRef.current = {
      blockId: block.id,
      mode,
      startX: event.clientX,
      originMs,
      moved: false,
      deltaMs: 0
    }
  }

  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    const current = gestureRef.current
    if (!current) return
    const dx = event.clientX - current.startX
    if (!current.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
    current.moved = true
    const deltaMs = Math.round(dx / pxPerMs)
    if (deltaMs === current.deltaMs && gesture?.moved) return
    current.deltaMs = deltaMs
    setGesture({ ...current })
  }

  function endGesture() {
    const finished = gestureRef.current
    gestureRef.current = null
    setGesture(null)
    if (!finished) return
    if (!finished.moved) {
      setSelectedId(finished.blockId)
      return
    }
    const { blockId, mode, originMs, deltaMs } = finished
    if (deltaMs === 0) return
    if (mode === 'move') {
      runEdit('Move caption', (timeline) =>
        editCaptionBlocks(timeline, (list) => moveCaptionBlock(list, blockId, deltaMs))
      )
    } else {
      const label = mode === 'start' ? 'Trim caption start' : 'Trim caption end'
      runEdit(label, (timeline) =>
        editCaptionBlocks(timeline, (list) =>
          trimCaptionBlock(list, blockId, mode, originMs + deltaMs)
        )
      )
    }
  }

  function cancelGesture() {
    gestureRef.current = null
    setGesture(null)
  }

  function beginEdit(block: CaptionBlock) {
    if (locked) return
    editSettled.current = false
    setSelectedId(block.id)
    setDraft(blockText(block))
    setEditingId(block.id)
  }

  function finishEdit(block: CaptionBlock, text: string | null) {
    if (editSettled.current) return
    editSettled.current = true
    setEditingId(null)
    if (text === null) return
    const edited = editCaptionText(block, text)
    // Empty text is refused and the block keeps its words.
    if (edited === null || blockText(edited) === blockText(block)) return
    runEdit('Edit caption text', (timeline) =>
      editCaptionBlocks(timeline, (list) =>
        list.map((item) => (item.id === block.id ? edited : item))
      )
    )
  }

  function onEditKey(event: KeyboardEvent<HTMLInputElement>, block: CaptionBlock) {
    event.stopPropagation()
    if (event.key === 'Enter') {
      finishEdit(block, draft)
    } else if (event.key === 'Escape') {
      finishEdit(block, null)
    }
  }

  function split(block: CaptionBlock) {
    const splitId = newId()
    const changed = runEdit('Split caption', (timeline) =>
      editCaptionBlocks(timeline, (list) => splitCaptionAtMs(list, block.id, playheadMs, splitId))
    )
    if (!changed) {
      toast.info({
        title: 'Cannot split here',
        description: 'Move the playhead inside the caption, past its first word.'
      })
    }
  }

  function merge(block: CaptionBlock) {
    const changed = runEdit('Merge captions', (timeline) =>
      editCaptionBlocks(timeline, (list) => mergeCaptionWithNext(list, block.id))
    )
    if (!changed) {
      toast.info({ title: 'Nothing to merge', description: 'This is the last caption.' })
    }
  }

  return (
    <>
      {shown.map((block) => {
        const { startMs, endMs } = blockSpanMs(block)
        const selected = block.id === selectedId
        const editing = block.id === editingId
        const moving = gesture?.blockId === block.id
        const classes = [
          styles.block,
          selected ? styles.selected : '',
          moving ? styles.moving : '',
          locked ? styles.locked : ''
        ]
          .filter((name) => name !== '')
          .join(' ')
        const original = blocks.find((item) => item.id === block.id) ?? block
        return (
          <div
            key={block.id}
            className={classes}
            style={{
              left: timeToX(startMs, pxPerMs),
              width: Math.max(timeToX(endMs - startMs, pxPerMs), 2)
            }}
            role="button"
            aria-label={`Caption ${blockText(block)}, ${formatTimecode(startMs)} to ${formatTimecode(endMs)}`}
            aria-pressed={selected}
            data-block-id={block.id}
            onPointerDown={(event) => beginGesture(event, block, 'move')}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={cancelGesture}
            onDoubleClick={() => beginEdit(original)}
          >
            {!locked && !editing ? (
              <>
                <div
                  className={`${styles.handle} ${styles.handleStart}`}
                  aria-hidden="true"
                  onPointerDown={(event) => beginGesture(event, block, 'start')}
                />
                <div
                  className={`${styles.handle} ${styles.handleEnd}`}
                  aria-hidden="true"
                  onPointerDown={(event) => beginGesture(event, block, 'end')}
                />
              </>
            ) : null}
            {editing ? (
              <input
                className={styles.editor}
                aria-label="Caption text"
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => onEditKey(event, original)}
                onBlur={() => finishEdit(original, draft)}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span className={styles.text}>{blockText(block)}</span>
            )}
            {selected && !editing && !locked ? (
              <div
                className={styles.menu}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <DropdownMenu
                  trigger={
                    <Button variant="ghost" size="sm">
                      Caption
                    </Button>
                  }
                  items={[
                    { label: 'Edit text', onSelect: () => beginEdit(original) },
                    { label: 'Split at playhead', onSelect: () => split(original) },
                    { label: 'Merge with next', onSelect: () => merge(original) }
                  ]}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
