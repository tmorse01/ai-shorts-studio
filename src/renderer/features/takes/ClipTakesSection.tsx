import type { JSX } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { setClipLocked, swapClipAlternative } from '@shared/timeline/edits'
import { Button } from '@renderer/ui/Button'
import { formatFieldTimecode } from '@renderer/ui/fieldMath'
import { useProjectStore } from '../project/useProjectStore'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { VideoClipTarget } from '../inspector/inspectorStore'
import styles from './ClipTakesSection.module.css'

// The inspector's takes section (Epic 15, #141), in the Video tab. For an assembled clip it lists the
// alternative takes the assembly picked for its line, each with a Swap button, and a Lock toggle that
// keeps the clip's place when the plan is applied again. Each change is one undoable edit.
export function ClipTakesSection(): JSX.Element {
  const target = useInspectorStore((state) => state.videoTarget)
  if (!target) {
    return <p className={styles.empty}>Select a video clip to see its takes.</p>
  }
  return <ClipTakesForm key={target.clip.id} target={target} />
}

interface ClipTakesFormProps {
  target: VideoClipTarget
}

function ClipTakesForm({ target }: ClipTakesFormProps): JSX.Element {
  const { clip, apply } = target
  const media = useProjectStore((state) => state.current?.project.media)
  const takes = clip.assembly?.alternatives ?? []
  const pinned = clip.locked === true
  const nameOf = (sourceId: string): string =>
    media?.find((item) => item.id === sourceId)?.fileName ?? 'Missing source'

  if (!clip.assembly) {
    return <p className={styles.empty}>This clip was not placed by an assembly plan.</p>
  }

  return (
    <div className={styles.body}>
      {takes.length === 0 ? (
        <p className={styles.empty}>This clip has no alternative takes.</p>
      ) : (
        <ul className={styles.list}>
          {takes.map((take, index) => (
            <li key={`${take.sourceId}-${take.inMs}-${index}`} className={styles.row}>
              <div className={styles.take}>
                <span className={styles.name} title={nameOf(take.sourceId)}>
                  Take {index + 1}: {nameOf(take.sourceId)}
                </span>
                <span className={styles.range}>
                  {formatFieldTimecode(take.inMs)} to {formatFieldTimecode(take.outMs)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  apply(`Swap to take ${index + 1}`, (timeline) =>
                    swapClipAlternative(timeline, clip.id, index)
                  )
                }
              >
                Swap
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        onClick={() =>
          apply(pinned ? 'Unlock clip' : 'Lock clip', (timeline) =>
            setClipLocked(timeline, clip.id, !pinned)
          )
        }
      >
        {pinned ? (
          <LockOpen size={14} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
        )}
        {pinned ? 'Unlock clip' : 'Lock clip'}
      </Button>
    </div>
  )
}
