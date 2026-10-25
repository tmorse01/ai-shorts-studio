// The search box above the media grid, a Filter popover for type, tag and duration, and one line of
// removable chips for the filters that are on. Changes go to mediaPanelStore, per project folder.
import { useState, type ChangeEvent, type JSX } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Filter, X } from 'lucide-react'
import type { MediaKind, MediaTag } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { activeFilterCount, isMediaFilterActive, type MediaFilter } from './mediaView'
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

interface FilterChip {
  key: string
  label: string
  remove: Partial<MediaFilter>
}

// One chip per filter that is on, so each can be removed on its own.
function filterChips(filter: MediaFilter, tags: readonly MediaTag[]): FilterChip[] {
  const chips: FilterChip[] = []
  for (const kind of filter.kinds) {
    const label = KINDS.find((item) => item.value === kind)?.label ?? kind
    chips.push({
      key: `kind-${kind}`,
      label,
      remove: { kinds: filter.kinds.filter((item) => item !== kind) }
    })
  }
  for (const tag of tags) {
    if (!filter.tagIds.includes(tag.id)) continue
    chips.push({
      key: `tag-${tag.id}`,
      label: tag.name,
      remove: { tagIds: filter.tagIds.filter((item) => item !== tag.id) }
    })
  }
  if (filter.minDurationSec !== undefined || filter.maxDurationSec !== undefined) {
    const from = filter.minDurationSec !== undefined ? `from ${filter.minDurationSec}s` : ''
    const to = filter.maxDurationSec !== undefined ? `to ${filter.maxDurationSec}s` : ''
    chips.push({
      key: 'duration',
      label: ['Length', from, to].filter(Boolean).join(' '),
      remove: { minDurationSec: undefined, maxDurationSec: undefined }
    })
  }
  return chips
}

export function MediaFilterBar({ folderPath, filter, tags }: MediaFilterBarProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const count = activeFilterCount(filter)
  const chips = filterChips(filter, tags)

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
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={count > 0 ? `Filter, ${count} active` : 'Filter'}
              className={styles.filterButton}
            >
              <Filter size={14} strokeWidth={1.75} aria-hidden="true" />
              Filter
              {count > 0 ? <span className={styles.count}>{count}</span> : null}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className={styles.popover} align="end" sideOffset={4}>
              <div className={styles.group} role="group" aria-label="Filter by type">
                <span className={styles.groupLabel}>Type</span>
                <div className={styles.options}>
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
              </div>

              {tags.length > 0 ? (
                <div className={styles.group} role="group" aria-label="Filter by tag">
                  <span className={styles.groupLabel}>Tags</span>
                  <div className={styles.options}>
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
                </div>
              ) : null}

              <div className={styles.group} role="group" aria-label="Filter by length">
                <span className={styles.groupLabel}>Length (seconds)</span>
                <div className={styles.options}>
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

              {count > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mediaPanelStore.getState().clearFilter(folderPath)}
                >
                  Clear filters
                </Button>
              ) : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      {chips.length > 0 ? (
        <div className={styles.chips} aria-label="Active filters">
          {chips.map((chip) => (
            <button
              type="button"
              key={chip.key}
              className={styles.chip}
              aria-label={`Remove filter ${chip.label}`}
              title={`Remove filter ${chip.label}`}
              onClick={() => setFilter(chip.remove)}
            >
              <span className={styles.chipText}>{chip.label}</span>
              <X size={12} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
