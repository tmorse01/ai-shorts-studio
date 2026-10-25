// One clip candidate in a list: a thumbnail with its duration, a title, a one-line summary, tag chips, the
// source range and a score. Clicking the main part opens the range in the source viewer. The Clip Finder
// list and the footage search results both use this row, so they look the same.
import type { JSX, ReactNode } from 'react'
import { Star } from 'lucide-react'
import type { ThumbReadFile } from '@shared/media/thumbs'
import { IconButton } from '@renderer/ui/IconButton'
import { Tooltip } from '@renderer/ui/Tooltip'
import { useThumb } from '../timeline/useThumb'
import { clipStarLabel } from './clipFinderModel'
import styles from './ClipRow.module.css'

export interface ClipRowProps {
  projectFolder: string
  mediaId: string
  thumbFile: ThumbReadFile | undefined
  /** The range length, shown on the thumbnail. */
  durationLabel?: string
  title: ReactNode
  summary?: string
  tags?: readonly string[]
  /** The In and Out timecodes, or any single timecode. */
  rangeLabel?: string
  /** "82/100". */
  scoreLabel?: string
  /** Set on AI suggestions, which carry the lavender "AI suggested" label. */
  aiLabel?: string
  active?: boolean
  onOpen?: () => void
  /** Buttons for the row, such as Accept, Preview and Add to timeline. They sit outside the open button. */
  actions?: ReactNode
  /** The favourite star. Absent for rows that cannot be starred. */
  star?: { starred: boolean; onToggle: () => void }
}

export function ClipRow({
  projectFolder,
  mediaId,
  thumbFile,
  durationLabel,
  title,
  summary,
  tags = [],
  rangeLabel,
  scoreLabel,
  aiLabel,
  active = false,
  onOpen,
  actions,
  star
}: ClipRowProps): JSX.Element {
  const thumb = useThumb(projectFolder, mediaId, thumbFile)
  return (
    <div
      className={styles.row}
      data-active={active ? 'true' : undefined}
      data-ai={aiLabel ? 'true' : undefined}
    >
      <button
        type="button"
        className={styles.open}
        aria-current={active || undefined}
        onClick={onOpen}
      >
        <span className={styles.thumb}>
          {thumb ? <img src={thumb.src} alt="" className={styles.image} /> : null}
          {durationLabel ? <span className={styles.badge}>{durationLabel}</span> : null}
        </span>
        <span className={styles.body}>
          <span className={styles.titleLine}>
            {aiLabel ? <span className={styles.ai}>{aiLabel}</span> : null}
            <span className={styles.title}>{title}</span>
          </span>
          {summary ? <span className={styles.summary}>{summary}</span> : null}
          {tags.length > 0 ? (
            <span className={styles.chips}>
              {tags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
          {rangeLabel || scoreLabel ? (
            <span className={styles.meta}>
              {rangeLabel ? <span>{rangeLabel}</span> : null}
              {scoreLabel ? <span className={styles.score}>{scoreLabel}</span> : null}
            </span>
          ) : null}
        </span>
      </button>
      {star ? (
        <Tooltip content={clipStarLabel(star.starred)}>
          <IconButton
            icon={Star}
            label={clipStarLabel(star.starred)}
            filled={star.starred}
            className={styles.star}
            aria-pressed={star.starred}
            onClick={star.onToggle}
          />
        </Tooltip>
      ) : null}
      {actions ? <span className={styles.actions}>{actions}</span> : null}
    </div>
  )
}
