// One ranked search result: a thumbnail, the snippet with its matching words highlighted, the timecode
// and the source name. Clicking the row opens the source viewer at the match.
import type { JSX } from 'react'
import type { ThumbReadFile } from '@shared/media/thumbs'
import type { SearchHit, SnippetPart } from '@shared/search/searchIndex'
import { formatDuration } from '../media/mediaView'
import { useThumb } from '../timeline/useThumb'
import { SEARCH_KIND_LABEL } from './searchActions'
import styles from './SearchResultRow.module.css'

export interface SearchResultRowProps {
  hit: SearchHit
  projectFolder: string
  fileName: string
  thumbFile: ThumbReadFile | undefined
  parts: readonly SnippetPart[]
  active: boolean
  onOpen: () => void
}

export function SearchResultRow({
  hit,
  projectFolder,
  fileName,
  thumbFile,
  parts,
  active,
  onOpen
}: SearchResultRowProps): JSX.Element {
  const thumb = useThumb(projectFolder, hit.mediaId, thumbFile)
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-active={active ? 'true' : undefined}
      className={styles.row}
      onClick={onOpen}
    >
      <span className={styles.thumb}>
        {thumb ? <img src={thumb.src} alt="" className={styles.image} /> : null}
      </span>
      <span className={styles.body}>
        <span className={styles.snippet}>
          {parts.map((part, index) =>
            part.match ? (
              <mark key={index} className={styles.match}>
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            )
          )}
        </span>
        <span className={styles.meta}>
          {`${fileName} · ${formatDuration(hit.startMs)} · ${SEARCH_KIND_LABEL[hit.kind]}`}
        </span>
      </span>
    </button>
  )
}
