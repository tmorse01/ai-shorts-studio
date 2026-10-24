import { describe, expect, it } from 'vitest'
import { setDucking, TimelineEditError } from '@shared/timeline/edits'
import { DEFAULT_DUCKING } from '@shared/timeline/ducking'
import type { Timeline } from '@shared/timeline/timeline'
import { createInspectorStore } from '@renderer/features/inspector/inspectorStore'

const base: Timeline = { tracks: [] }

describe('setDucking', () => {
  it('stores the given fields and keeps the rest at their defaults', () => {
    const next = setDucking(base, { amountDb: 6 })
    expect(next.ducking).toEqual({ ...DEFAULT_DUCKING, amountDb: 6 })
  })

  it('keeps stored values the change does not name', () => {
    const stored = setDucking(base, { attackMs: 200, releaseMs: 900 })
    const next = setDucking(stored, { amountDb: 3 })
    expect(next.ducking).toEqual({ amountDb: 3, attackMs: 200, releaseMs: 900 })
  })

  it('returns the same timeline when nothing changes, so no history entry is made', () => {
    expect(setDucking(base, { amountDb: DEFAULT_DUCKING.amountDb })).not.toBe(base)
    const stored = setDucking(base, {})
    expect(setDucking(stored, {})).toBe(stored)
  })

  it('refuses values outside the schema ranges', () => {
    expect(() => setDucking(base, { amountDb: 25 })).toThrow(TimelineEditError)
    expect(() => setDucking(base, { attackMs: -1 })).toThrow(TimelineEditError)
    expect(() => setDucking(base, { releaseMs: 5001 })).toThrow(TimelineEditError)
  })
})

describe('inspector music target', () => {
  it('has no music target until the timeline pane publishes one', () => {
    const store = createInspectorStore()
    expect(store.getState().musicTarget).toBeNull()
  })
})
