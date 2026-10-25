import { describe, expect, it } from 'vitest'
import type { MediaRef, Project } from '@shared/project/schema'
import { narrationTakeClip } from '@shared/narration/take'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { addNarrationTakeCommand } from '@renderer/features/narration/narrationTakeCommands'

const NOW = '2026-10-24T10:00:00.000Z'

const media: MediaRef = {
  id: 'take-media',
  path: 'media/narration/take-1.wav',
  pathKind: 'relative',
  fileName: 'take-1.wav',
  sizeBytes: 96044,
  durationMs: 1000,
  kind: 'audio'
}

const clip = narrationTakeClip({
  clipId: 'take-clip',
  mediaId: 'take-media',
  startMs: 2000,
  durationMs: 1000
})

function projectWithoutNarration(): Project {
  return {
    media: [],
    shorts: [
      {
        id: 's1',
        status: 'draft',
        updatedAt: '2026-10-23T09:00:00.000Z',
        editedSinceExport: false,
        timeline: {
          tracks: [{ id: 'main', kind: 'video', role: 'main', muted: false, clips: [] }]
        }
      }
    ]
  } as unknown as Project
}

function addTake() {
  return addNarrationTakeCommand({
    shortId: 's1',
    label: 'Record narration',
    now: NOW,
    media,
    clip,
    narrationTrackId: 'narr-track'
  })
}

describe('recording a take as one undoable command', () => {
  it('adds the footage and the narration clip, creating the Narration lane', () => {
    const store = createHistoryStore(projectWithoutNarration())
    expect(store.getState().execute(addTake())).toBe(true)

    const project = store.getState().present
    expect(project.media).toEqual([media])
    const narration = project.shorts[0].timeline.tracks.find((track) => track.role === 'narration')
    expect(narration).toMatchObject({ id: 'narr-track', kind: 'audio' })
    expect(narration?.clips).toEqual([
      expect.objectContaining({ id: 'take-clip', startMs: 2000, narration: { source: 'recorded' } })
    ])
  })

  it('undoes and redoes the footage, the lane and the clip together', () => {
    const store = createHistoryStore(projectWithoutNarration())
    store.getState().execute(addTake())

    expect(store.getState().undo()).toBe(true)
    const undone = store.getState().present
    expect(undone.media).toEqual([])
    expect(undone.shorts[0].timeline.tracks.map((track) => track.role)).toEqual(['main'])

    expect(store.getState().redo()).toBe(true)
    const redone = store.getState().present
    expect(redone.media).toEqual([media])
    expect(
      redone.shorts[0].timeline.tracks.find((track) => track.role === 'narration')?.clips
    ).toHaveLength(1)
  })

  it('reuses an existing Narration lane and does not duplicate the footage', () => {
    const project = projectWithoutNarration()
    project.media = [media]
    project.shorts[0].timeline.tracks.push({
      id: 'existing-narr',
      kind: 'audio',
      role: 'narration',
      muted: false,
      clips: []
    })
    const store = createHistoryStore(project)
    store.getState().execute(addTake())

    const tracks = store.getState().present.shorts[0].timeline.tracks
    expect(tracks.filter((track) => track.role === 'narration')).toHaveLength(1)
    expect(tracks.find((track) => track.role === 'narration')?.clips).toHaveLength(1)
    expect(store.getState().present.media).toHaveLength(1)
  })
})
