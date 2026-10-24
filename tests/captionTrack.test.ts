import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/project/schema'
import { TimelineEditError } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import { applyCaptionRange } from '@shared/captions/captionTrack'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { generateCaptionsCommand } from '@renderer/features/captions/captionCommands'

const NOW = '2026-10-24T10:00:00.000Z'

function block(id: string, startMs: number): CaptionBlock {
  return { id, words: [{ text: id, startMs, endMs: startMs + 200 }] }
}

function timelineWith(captionsLocked = false): Timeline {
  return {
    tracks: [
      {
        id: 'main',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: [
          {
            id: 'clip',
            mediaId: 'm1',
            startMs: 0,
            durationMs: 4000,
            sourceInMs: 0,
            transform: IDENTITY_TRANSFORM
          }
        ]
      },
      {
        id: 'cap',
        kind: 'text',
        role: 'captions',
        muted: false,
        locked: captionsLocked,
        clips: [],
        captions: [block('old-early', 500), block('old-late', 3500)]
      }
    ]
  }
}

function captionIds(timeline: Timeline): string[] {
  return (timeline.tracks.find((track) => track.role === 'captions')?.captions ?? []).map(
    (item) => item.id
  )
}

describe('applyCaptionRange', () => {
  it('replaces captions in the range and keeps the ones outside it', () => {
    const next = applyCaptionRange(timelineWith(), {
      rangeStartMs: 0,
      rangeEndMs: 3000,
      blocks: [block('new', 1000)],
      newTrackId: 'unused'
    })
    expect(captionIds(next)).toEqual(['new', 'old-late'])
  })

  it('adds a captions track when the timeline has none', () => {
    const timeline = timelineWith()
    const bare: Timeline = { tracks: timeline.tracks.filter((track) => track.role !== 'captions') }
    const next = applyCaptionRange(bare, {
      rangeStartMs: 0,
      rangeEndMs: 4000,
      blocks: [block('first', 100)],
      newTrackId: 'captions-new'
    })
    const added = next.tracks.find((track) => track.id === 'captions-new')
    expect(added?.role).toBe('captions')
    expect(added?.captions?.map((item) => item.id)).toEqual(['first'])
  })

  it('refuses an edit on a locked captions track', () => {
    expect(() =>
      applyCaptionRange(timelineWith(true), {
        rangeStartMs: 0,
        rangeEndMs: 4000,
        blocks: [],
        newTrackId: 'unused'
      })
    ).toThrow(TimelineEditError)
  })

  it('refuses a range that ends before it starts', () => {
    expect(() =>
      applyCaptionRange(timelineWith(), {
        rangeStartMs: 2000,
        rangeEndMs: 1000,
        blocks: [],
        newTrackId: 'unused'
      })
    ).toThrow(TimelineEditError)
  })
})

describe('generateCaptionsCommand', () => {
  function projectWith(timeline: Timeline): Project {
    return {
      shorts: [
        {
          id: 's1',
          status: 'draft',
          updatedAt: '2026-10-23T09:00:00.000Z',
          editedSinceExport: false,
          timeline
        }
      ]
    } as unknown as Project
  }

  it('is one undo step that restores the captions before the edit', () => {
    const history = createHistoryStore(projectWith(timelineWith()))
    const ran = history.getState().execute(
      generateCaptionsCommand({
        shortId: 's1',
        label: 'Generate captions from narration',
        now: NOW,
        rangeStartMs: 0,
        rangeEndMs: 4000,
        blocks: [block('gen', 1000)],
        newTrackId: 'unused'
      })
    )
    expect(ran).toBe(true)
    expect(captionIds(history.getState().present.shorts[0].timeline)).toEqual(['gen'])

    expect(history.getState().undo()).toBe(true)
    expect(captionIds(history.getState().present.shorts[0].timeline)).toEqual([
      'old-early',
      'old-late'
    ])
  })
})
