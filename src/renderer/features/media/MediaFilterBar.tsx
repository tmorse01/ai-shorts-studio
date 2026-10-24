// The search box and filter controls above the media list: name search, type and tag toggles, and a
// duration range. Changes go to mediaPanelStore, per project folder, for this session.
import type { ChangeEvent, JSX } from 'react'
import { X } from 'lucide-react'
import type { MediaKind, MediaTag } from '@shared/project/schema'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { isMediaFilterActive, type MediaFilter } from './mediaView'
import { mediaPanelStore } from './mediaPanelStore'
import styles from './MediaFilterBar.module.css'

const KINDS: { value: MediaKind; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'image', label: 'Image' }
]

export interface MediaFilterBarProps {
  folderPath: string
  filter: MediaFilter
  tags: readonly MediaTag[]
}

export function MediaFilterBar({ folderPath, filter, tags }: MediaFilterBarProps): JSX.Element {
  const setFilter = (patch: Partial<MediaFilter>) =>
    mediaPanelStore.getState().setFilter(folderPath, patch)

  const toggleKind = (kind: MediaKind) => {
    const kinds = filter.kinds.includes(kind)
      ? filter.kinds.filter((item) => item !== kind)
      : [...filter.kinds, kind]
    setFilter({ kinds })
  }

  const toggleTag = (tagId: string) => {
    const tagIds = filter.tagIds.includes(tagId)
      ? filter.tagIds.filter((item) => item !== tagId)
      : [...filter.tagIds, tagId]
    setFilter({ tagIds })
  }

  const onDuration =
    (key: 'minDurationSec' | 'maxDurationSec') => (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value.trim()
      const value = Number(text)
      setFilter({ [key]: text === '' || !Number.isFinite(value) || value < 0 ? undefined : value })
    }

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <Input
          type="search"
          aria-label="Search media by name"
          placeholder="Search by name"
          value={filter.query}
          onChange={(event) => setFilter({ query: event.target.value })}
          className={styles.search}
        />
        {isMediaFilterActive(filter) ? (
          <IconButton
            icon={X}
            label="Clear search and filters"
            onClick={() => mediaPanelStore.getState().clearFilter(folderPath)}
          />
        ) : null}
      </div>

      <div className={styles.row} role="group" aria-label="Filter by type">
        {KINDS.map((kind) => (
          <button
            type="button"
            key={kind.value}
            aria-pressed={filter.kinds.includes(kind.value)}
            className={`${styles.toggle} ${filter.kinds.includes(kind.value) ? styles.on : ''}`}
            onClick={() => toggleKind(kind.value)}
          >
            {kind.label}
          </button>
        ))}
      </div>

      {tags.length > 0 ? (
        <div className={styles.row} role="group" aria-label="Filter by tag">
          {tags.map((tag) => (
            <button
              type="button"
              key={tag.id}
              aria-pressed={filter.tagIds.includes(tag.id)}
              className={`${styles.toggle} ${filter.tagIds.includes(tag.id) ? styles.on : ''}`}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.row}>
        <Input
          type="number"
          min={0}
          aria-label="Shortest duration in seconds"
          placeholder="Min sec"
          value={filter.minDurationSec ?? ''}
          onChange={onDuration('minDurationSec')}
          className={styles.duration}
        />
        <Input
          type="number"
          min={0}
          aria-label="Longest duration in seconds"
          placeholder="Max sec"
          value={filter.maxDurationSec ?? ''}
          onChange={onDuration('maxDurationSec')}
          className={styles.duration}
        />
      </div>
    </div>
  )
}
