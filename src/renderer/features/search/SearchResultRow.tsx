// One ranked search result, shown with the same row as the Clip Finder list: a thumbnail, the snippet with
// its matching words highlighted, the source name and the timecode. Clicking the row opens the source viewer
// at the match.
import type { JSX } from 'react'
import type { ThumbReadFile } from '@shared/media/thumbs'
import type { SearchHit, SnippetPart } from '@shared/search/searchIndex'
import { ClipRow } from '../clipFinder/ClipRow'
import { formatDuration } from '../media/mediaView'
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
  return (
    <ClipRow
      projectFolder={projectFolder}
      mediaId={hit.mediaId}
      thumbFile={thumbFile}
      title={
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
      }
      summary={fileName}
      tags={[SEARCH_KIND_LABEL[hit.kind]]}
      rangeLabel={formatDuration(hit.startMs)}
      active={active}
      onOpen={onOpen}
    />
  )
}
