// The footage search box in the Media panel. It searches transcript speech, shot descriptions, tags and
// moment names through the local index. Results are ranked; Enter or a click opens the match in the
// source viewer. The Media panel hides its grid while a search is active.
import { useState, type JSX, type KeyboardEvent } from 'react'
import { useStore } from 'zustand'
import { thumbFileName } from '@shared/media/thumbs'
import { queryTermsOf, snippetFor, type SearchHit } from '@shared/search/searchIndex'
import type { Project } from '@shared/project/schema'
import { Input } from '@renderer/ui/Input'
import { searchIndex, searchIndexStore } from './searchIndexStore'
import { openSearchHit } from './searchActions'
import { SearchResultRow } from './SearchResultRow'
import styles from './MomentSearch.module.css'

const RESULT_LIMIT = 50

export interface MomentSearchProps {
  folderPath: string
  project: Project
  query: string
  onQueryChange: (query: string) => void
}

export function MomentSearch({
  folderPath,
  project,
  query,
  onQueryChange
}: MomentSearchProps): JSX.Element {
  const [active, setActive] = useState(0)
  // Re-runs the search when the index changes, for example when an analysis stage finishes.
  useStore(searchIndexStore, (state) => state.revision)
  const searching = query.trim() !== ''
  const hits: SearchHit[] = searching ? searchIndex.search(query, RESULT_LIMIT) : []
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0))
  const terms = queryTermsOf(query)

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, Math.max(hits.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter') {
      const hit = hits[activeIndex]
      if (hit) openSearchHit(hit)
    } else if (event.key === 'Escape') {
      onQueryChange('')
    }
  }

  return (
    <div className={styles.wrap}>
      <Input
        type="search"
        role="combobox"
        aria-label="Search footage"
        aria-expanded={searching}
        aria-autocomplete="list"
        placeholder="Search speech, shots, tags and moments"
        value={query}
        onChange={(event) => {
          setActive(0)
          onQueryChange(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      {searching ? (
        <div role="listbox" aria-label="Search results" className={styles.results}>
          {hits.length === 0 ? (
            <p className={styles.empty}>No matches for “{query.trim()}”.</p>
          ) : (
            hits.map((hit, index) => {
              const ref = project.media.find((item) => item.id === hit.mediaId)
              const thumbFile = ref ? thumbFileName(ref.kind) : undefined
              return (
                <SearchResultRow
                  key={hit.id}
                  hit={hit}
                  projectFolder={folderPath}
                  fileName={ref?.fileName ?? 'Missing file'}
                  thumbFile={thumbFile}
                  parts={snippetFor(hit.text, terms)}
                  active={index === activeIndex}
                  onOpen={() => openSearchHit(hit)}
                />
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
