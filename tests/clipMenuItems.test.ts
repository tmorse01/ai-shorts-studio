import { describe, expect, it, vi } from 'vitest'
import { TRANSITION_KINDS } from '@shared/timeline/transitions'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'
import { clipMenuItems, type ClipMenuContext } from '@renderer/features/timeline/clipMenuItems'

// The clip menu's item list (#302). The menu opens from a right-click or Shift+F10 on a clip, and its
// items come from clipMenuItems. Each item runs one edit through runEdit.

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'm1',
    startMs: 0,
    durationMs: 5000,
    sourceInMs: 0,
    ...extra
  } as unknown as Clip
}

function track(id: string, extra: Partial<Track>): Track {
  return { id, muted: false, clips: [], ...extra } as unknown as Track
}

function timelineOf(tracks: Track[]): Timeline {
  return { tracks } as unknown as Timeline
}

function contextFor(
  timeline: Timeline,
  clipId: string,
  selectedIds: string[] = [clipId]
): ClipMenuContext & { runEdit: ReturnType<typeof vi.fn> } {
  const found = timeline.tracks
    .map((item) => ({ track: item, clip: item.clips.find((c) => c.id === clipId) }))
    .find((item) => item.clip !== undefined)
  if (!found || !found.clip) throw new Error(`no clip ${clipId}`)
  return {
    timeline,
    clip: found.clip,
    track: found.track,
    selectedIds,
    runEdit: vi.fn(),
    newId: () => 'new-id',
    clipSourceLength: () => 60_000
  } as ClipMenuContext & { runEdit: ReturnType<typeof vi.fn> }
}

function labels(context: ClipMenuContext): string[] {
  return clipMenuItems(context).map((item) => item.label)
}

describe('clip menu items', () => {
  it('offers Detach audio and Mute clip for a video clip on the main track, with the cut items', () => {
    const main = track('main', {
      kind: 'video',
      role: 'main',
      clips: [clip('a', { startMs: 0 }), clip('b', { startMs: 5000 })]
    })
    const music = track('music', { kind: 'audio', role: 'music', clips: [] })
    const context = contextFor(timelineOf([main, music]), 'b')

    const items = labels(context)
    expect(items[0]).toBe('Detach audio')
    expect(items[1]).toBe('Mute clip')
    expect(items.slice(2)).toHaveLength(TRANSITION_KINDS.length)
    expect(items.slice(2).every((label) => label.endsWith(' at cut'))).toBe(true)
  })

  it('offers Mute clip, and Unmute clip when muted, for a music clip with no cut items', () => {
    const music = track('music', {
      kind: 'audio',
      role: 'music',
      clips: [clip('m', { mediaId: 'm2', muted: false })]
    })
    expect(labels(contextFor(timelineOf([music]), 'm'))).toEqual(['Mute clip'])

    const muted = track('music', {
      kind: 'audio',
      role: 'music',
      clips: [clip('m', { mediaId: 'm2', muted: true })]
    })
    expect(labels(contextFor(timelineOf([muted]), 'm'))).toEqual(['Unmute clip'])
  })

  it('offers the takes and Lock clip for an assembled clip', () => {
    const assembled = clip('a', {
      assembly: {
        lineId: 'line-1',
        alternatives: [{}, {}]
      }
    } as unknown as Partial<Clip>)
    const main = track('main', { kind: 'video', role: 'main', clips: [assembled] })
    // No music track here, so there is no Detach audio. A main-track clip with no cut before it has
    // no cut items.
    expect(labels(contextFor(timelineOf([main]), 'a'))).toEqual([
      'Mute clip',
      'Swap to take 1',
      'Swap to take 2',
      'Lock clip'
    ])
  })

  it('offers Unlock clip for a pinned assembled clip', () => {
    const assembled = clip('a', {
      locked: true,
      assembly: { lineId: 'line-1', alternatives: [{}] }
    } as unknown as Partial<Clip>)
    const music = track('music', { kind: 'audio', role: 'music', clips: [] })
    const main = track('main', { kind: 'video', role: 'main', clips: [assembled] })
    const items = labels(contextFor(timelineOf([main, music]), 'a'))
    expect(items).toContain('Unlock clip')
    expect(items).not.toContain('Lock clip')
  })

  it('offers nothing on a locked track', () => {
    const main = track('main', {
      kind: 'video',
      role: 'main',
      locked: true,
      clips: [clip('a')]
    })
    expect(labels(contextFor(timelineOf([main]), 'a'))).toEqual([])
  })

  it('offers nothing when the clip is not the only selected clip', () => {
    const main = track('main', {
      kind: 'video',
      role: 'main',
      clips: [clip('a'), clip('b', { startMs: 5000 })]
    })
    expect(labels(contextFor(timelineOf([main]), 'a', ['a', 'b']))).toEqual([])
  })

  it('runs one edit through runEdit when an item is chosen', () => {
    const music = track('music', { kind: 'audio', role: 'music', clips: [clip('m')] })
    const context = contextFor(timelineOf([music]), 'm')
    clipMenuItems(context)[0].onSelect()
    expect(context.runEdit).toHaveBeenCalledTimes(1)
    expect(context.runEdit).toHaveBeenCalledWith('Mute clip', expect.any(Function))
  })
})
