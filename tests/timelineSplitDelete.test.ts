import { describe, expect, it, vi } from 'vitest'
import { closeGap, deleteClips, splitClipsAt } from '@shared/timeline/edits'
import { mainGaps } from '@shared/timeline/gaps'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'
import {
  closeGapEdit,
  timelineShortcuts,
  type TimelineShortcutContext
} from '@renderer/features/timeline/timelineShortcuts'
import {
  createShortcutRegistry,
  formatBinding,
  type KeyPress
} from '@renderer/features/shortcuts/shortcutRegistry'

function clip(id: string, startMs: number, durationMs: number, sourceInMs = 0): Clip {
  return { id, mediaId: 'media_1', startMs, durationMs, sourceInMs, transform: IDENTITY_TRANSFORM }
}

function track(id: string, role: Track['role'], clips: Clip[], locked = false): Track {
  return { id, kind: 'video', role, muted: false, locked, clips }
}

function ids(timeline: Timeline, trackId: string): string[] {
  return timeline.tracks.find((item) => item.id === trackId)?.clips.map((item) => item.id) ?? []
}

function sequence(): Timeline {
  return {
    tracks: [track('main', 'main', [clip('a', 0, 1000), clip('b', 2000, 1000)])]
  }
}

function counter(): () => string {
  let next = 0
  return () => `new-${(next += 1)}`
}

function press(key: string): KeyPress {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }
}

describe('splitClipsAt', () => {
  it('splits only the selected clips under the playhead', () => {
    const timeline: Timeline = {
      tracks: [track('main', 'main', [clip('a', 0, 1000), clip('b', 1000, 1000)])]
    }
    const next = splitClipsAt(timeline, 500, ['a'], counter())
    expect(ids(next, 'main')).toEqual(['a', 'new-1', 'b'])
    expect(next.tracks[0].clips[0].durationMs).toBe(500)
    expect(next.tracks[0].clips[1]).toMatchObject({
      startMs: 500,
      durationMs: 500,
      sourceInMs: 500
    })
  })

  it('leaves a selected clip alone when the playhead is not inside it', () => {
    const timeline = sequence()
    expect(splitClipsAt(timeline, 1500, ['a'], counter())).toBe(timeline)
  })

  it('splits every unlocked clip under the playhead when nothing is selected', () => {
    const timeline: Timeline = {
      tracks: [
        track('main', 'main', [clip('a', 0, 1000)]),
        track('overlay', 'overlay', [clip('o', 200, 600)])
      ]
    }
    const next = splitClipsAt(timeline, 400, [], counter())
    expect(ids(next, 'main')).toEqual(['a', 'new-1'])
    expect(ids(next, 'overlay')).toEqual(['o', 'new-2'])
  })

  it('never splits a clip on a locked track', () => {
    const timeline: Timeline = {
      tracks: [track('main', 'main', [clip('a', 0, 1000)], true)]
    }
    expect(splitClipsAt(timeline, 500, [], counter())).toBe(timeline)
    expect(splitClipsAt(timeline, 500, ['a'], counter())).toBe(timeline)
  })

  it('does not split at the very start or end of a clip', () => {
    const timeline = sequence()
    expect(splitClipsAt(timeline, 0, [], counter())).toBe(timeline)
    expect(splitClipsAt(timeline, 1000, [], counter())).toBe(timeline)
  })
})

describe('deleteClips', () => {
  it('removes the selected clips and leaves a gap on the main track', () => {
    const next = deleteClips(sequence(), ['a'])
    expect(ids(next, 'main')).toEqual(['b'])
    expect(mainGaps(next)).toEqual([{ trackId: 'main', startMs: 0, endMs: 2000 }])
  })

  it('skips clips on a locked track and returns the same timeline when nothing is removed', () => {
    const timeline: Timeline = {
      tracks: [track('main', 'main', [clip('a', 0, 1000)], true)]
    }
    expect(deleteClips(timeline, ['a'])).toBe(timeline)
    const plain = sequence()
    expect(deleteClips(plain, ['missing'])).toBe(plain)
  })

  it('drops the transitions of every removed clip', () => {
    const timeline: Timeline = {
      ...sequence(),
      transitions: [{ id: 't', fromClipId: 'a', toClipId: 'b', durationMs: 200 }]
    }
    expect(deleteClips(timeline, ['a']).transitions).toEqual([])
  })
})

describe('mainGaps', () => {
  it('finds the gap before the first clip and the gaps between clips', () => {
    const timeline: Timeline = {
      tracks: [track('main', 'main', [clip('b', 3000, 1000), clip('a', 1000, 500)])]
    }
    expect(mainGaps(timeline)).toEqual([
      { trackId: 'main', startMs: 0, endMs: 1000 },
      { trackId: 'main', startMs: 1500, endMs: 3000 }
    ])
  })

  it('does not count empty time after the last clip, or gaps on free layers', () => {
    const timeline: Timeline = {
      tracks: [
        track('main', 'main', [clip('a', 0, 1000)]),
        track('overlay', 'overlay', [clip('o', 5000, 100)])
      ]
    }
    expect(mainGaps(timeline)).toEqual([])
  })

  it('closes the gap it reports', () => {
    const timeline: Timeline = {
      tracks: [track('main', 'main', [clip('a', 0, 1000), clip('b', 2000, 1000)])]
    }
    const [gap] = mainGaps(timeline)
    const closed = closeGap(timeline, gap.trackId, gap.startMs)
    expect(ids(closed, 'main')).toEqual(['a', 'b'])
    expect(closed.tracks[0].clips[1].startMs).toBe(1000)
  })
})

function context(overrides: Partial<TimelineShortcutContext> = {}): TimelineShortcutContext {
  return {
    timeline: sequence(),
    selectedIds: [],
    gap: null,
    playheadMs: 500,
    newId: counter(),
    edit: vi.fn(() => true),
    clearSelection: vi.fn(),
    ...overrides
  }
}

function registerTimeline(ctx: TimelineShortcutContext) {
  const registry = createShortcutRegistry()
  timelineShortcuts(() => ctx).forEach((shortcut) => registry.register(shortcut))
  return registry
}

describe('timeline shortcuts', () => {
  it('binds S to split, and Delete or Backspace to delete', () => {
    const shortcuts = timelineShortcuts(() => context())
    expect(shortcuts.find((item) => item.id === 'timeline.split')?.keys).toEqual(['s'])
    expect(shortcuts.find((item) => item.id === 'timeline.delete')?.keys).toEqual([
      'delete',
      'backspace'
    ])
    expect(shortcuts.every((item) => item.group === 'Timeline')).toBe(true)
  })

  it('runs split as one edit and keeps the selection', () => {
    const ctx = context({ selectedIds: ['a'] })
    registerTimeline(ctx).handle(press('s'))
    expect(ctx.edit).toHaveBeenCalledWith('Split clip', expect.any(Function))
    expect(ctx.clearSelection).not.toHaveBeenCalled()
  })

  it('deletes the selected clips and clears the selection once the edit applies', () => {
    const ctx = context({ selectedIds: ['a'] })
    registerTimeline(ctx).handle(press('Delete'))
    expect(ctx.edit).toHaveBeenCalledWith('Delete clips', expect.any(Function))
    expect(ctx.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('closes a selected gap with Backspace', () => {
    const gap = { trackId: 'main', startMs: 0, endMs: 1000 }
    const ctx = context({ gap })
    registerTimeline(ctx).handle(press('Backspace'))
    expect(ctx.edit).toHaveBeenCalledWith('Close gap', expect.any(Function))
    expect(closeGapEdit(gap)(sequence()).tracks[0].clips[0].startMs).toBe(0)
  })

  it('keeps the selection when the edit is refused', () => {
    const ctx = context({ selectedIds: ['a'], edit: vi.fn(() => false) })
    registerTimeline(ctx).handle(press('delete'))
    expect(ctx.clearSelection).not.toHaveBeenCalled()
  })

  it('does nothing on Delete with no selection', () => {
    const ctx = context()
    registerTimeline(ctx).handle(press('delete'))
    expect(ctx.edit).not.toHaveBeenCalled()
  })
})

describe('formatBinding for the timeline keys', () => {
  it('spells out Delete and Backspace in the shortcuts dialog', () => {
    expect(formatBinding('delete')).toBe('Delete')
    expect(formatBinding('backspace')).toBe('Backspace')
    expect(formatBinding('s')).toBe('S')
  })
})
