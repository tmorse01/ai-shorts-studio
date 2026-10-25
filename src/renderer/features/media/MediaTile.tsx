// One media file in the Media grid: a fixed-size tile with a 16:9 thumbnail, a one-line name and a
// duration badge. Status sits top-left, and usage and moments badges appear on hover or focus.
// MediaTile is presentational; LoadedMediaTile reads the cached thumbnail for it.
import { useId, type ButtonHTMLAttributes, type JSX, type ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  MoreHorizontal
} from 'lucide-react'
import type { MediaKind } from '@shared/project/schema'
import { thumbFileName } from '@shared/media/thumbs'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { Tooltip } from '@renderer/ui/Tooltip'
import { useThumb, type ThumbImage } from '../timeline/useThumb'
import { formatDuration } from './mediaView'
import { momentsBadge, shortsBadge, type TileStatus } from './mediaTileModel'
import styles from './MediaTile.module.css'

const KIND_ICON = { video: Film, audio: Music, image: ImageIcon } as const

export interface MediaTileProps {
  fileName: string
  kind: MediaKind
  durationMs?: number
  /** The cached thumbnail, or null while it loads or when there is none. */
  thumb: ThumbImage | null
  tagNames: readonly string[]
  selected: boolean
  status: TileStatus
  shortCount: number
  momentCount: number
  momentsOpen: boolean
  onToggleMoments: () => void
  /** Retry analysis. Offered in the tile menu when the analysis failed. */
  onRetry?: () => void
  /** Click, drag and selection handlers for the tile's main button. */
  itemProps: ButtonHTMLAttributes<HTMLButtonElement>
  /** Shown under the tile when its moments are open. */
  momentRows?: ReactNode
}

export function MediaTile({
  fileName,
  kind,
  durationMs,
  thumb,
  tagNames,
  selected,
  status,
  shortCount,
  momentCount,
  momentsOpen,
  onToggleMoments,
  onRetry,
  itemProps,
  momentRows
}: MediaTileProps): JSX.Element {
  const Icon = KIND_ICON[kind]
  // The button is named by its file name alone, so the duration is not read as part of the name.
  const nameId = useId()
  const tooltip = [
    fileName,
    status.kind === 'busy' ? status.label : null,
    tagNames.length > 0 ? `Tags: ${tagNames.join(', ')}` : null
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className={styles.cell} data-expanded={momentsOpen ? 'true' : undefined}>
      <div
        className={styles.tile}
        data-kind={kind}
        data-status={status.kind}
        data-selected={selected ? 'true' : undefined}
      >
        <button
          type="button"
          aria-pressed={selected}
          aria-labelledby={nameId}
          title={tooltip}
          className={styles.item}
          {...itemProps}
        >
          <span className={styles.thumb}>
            {thumb ? (
              <img
                className={kind === 'audio' ? styles.waveform : styles.image}
                src={thumb.src}
                alt=""
                draggable={false}
              />
            ) : (
              <span className={styles.placeholder} aria-hidden="true">
                <Icon size={26} strokeWidth={1.5} />
              </span>
            )}
            <span className={styles.duration}>{formatDuration(durationMs)}</span>
          </span>
          <span id={nameId} className={styles.name}>
            {fileName}
          </span>
          {tagNames.length > 0 ? <span className={styles.tags}>{tagNames.join(', ')}</span> : null}
        </button>

        <TileStatusIcon status={status} />

        <div className={styles.overlay}>
          {shortCount > 0 ? <span className={styles.badge}>{shortsBadge(shortCount)}</span> : null}
          {momentCount > 0 ? (
            <button
              type="button"
              className={styles.badge}
              aria-expanded={momentsOpen}
              onClick={onToggleMoments}
            >
              {momentsOpen ? (
                <ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />
              )}
              {momentsBadge(momentCount)}
            </button>
          ) : null}
          {onRetry ? (
            <DropdownMenu
              trigger={<IconButton icon={MoreHorizontal} label={`More actions for ${fileName}`} />}
              items={[{ label: 'Retry analysis', onSelect: onRetry }]}
            />
          ) : null}
        </div>
      </div>
      {momentRows}
    </div>
  )
}

// The status icon in the thumbnail's top-left corner. Text never appears in the tile itself.
function TileStatusIcon({ status }: { status: TileStatus }): JSX.Element | null {
  if (status.kind === 'none') return null
  if (status.kind === 'analysed') {
    return (
      <span
        className={`${styles.status} ${styles.analysed}`}
        role="img"
        aria-label="Analysed"
        title="Analysed"
      >
        <Check size={12} strokeWidth={2.25} aria-hidden="true" />
      </span>
    )
  }
  if (status.kind === 'busy') {
    return (
      <span className={styles.status} role="img" aria-label={status.label} title={status.label}>
        <Loader2 className={styles.spin} size={14} strokeWidth={2} aria-hidden="true" />
      </span>
    )
  }
  return (
    <Tooltip content={status.reason}>
      <span
        className={`${styles.status} ${styles.failed}`}
        role="img"
        tabIndex={0}
        aria-label={`Analysis failed: ${status.reason}`}
      >
        <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
      </span>
    </Tooltip>
  )
}

export interface LoadedMediaTileProps extends Omit<MediaTileProps, 'thumb'> {
  folderPath: string
  mediaId: string
}

// Reads the tile's thumbnail from the media cache: the poster frame of a video, the image of a still,
// or the waveform of audio.
export function LoadedMediaTile({
  folderPath,
  mediaId,
  kind,
  ...rest
}: LoadedMediaTileProps): JSX.Element {
  const thumb = useThumb(folderPath, mediaId, thumbFileName(kind))
  return <MediaTile kind={kind} thumb={thumb} {...rest} />
}
