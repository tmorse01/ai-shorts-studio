import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/project/schema'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'
import { insertClip, moveClip, setClipAudio, trimClip } from '@shared/timeline/edits'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { timelineCommand } from '@renderer/features/timeline/timelineCommands'

const NOW = '2026-10-24T10:00:00.000Z'

const voice: Clip = {
  id: 'voice-1',
  mediaId: 'vo',
  startMs: 0,
  durationMs: 2000,
  sourceInMs: 0,
  transform: IDENTITY_TRANSFORM,
  narration: { source: 'recorded' }
}

function projectWithNarration(): Project {
  const timeline: Timeline = {
    tracks: [
      { id: 'main', kind: 'video', role: 'main', muted: false, clips: [] },
      { id: 'narr', kind: 'audio', role: 'narration', muted: false, clips: [] }
    ]
  }
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

function narrationClips(project: Project): Clip[] {
  return project.shorts[0].timeline.tracks.find((track) => track.id === 'narr')?.clips ?? []
}

describe('narration clips use the audio edits', () => {
  it('moves a narration clip to another start time on its lane', () => {
    const timeline = insertClip(projectWithNarration().shorts[0].timeline, 'narr', voice, 0)
    const moved = moveClip(timeline, 'voice-1', 'narr', 3000)
    expect(moved.tracks[1].clips[0]).toMatchObject({ id: 'voice-1', startMs: 3000 })
    expect(moved.tracks[1].clips[0].narration).toEqual({ source: 'recorded' })
  })

  it('trims the end of a narration clip and keeps its narration data', () => {
    const timeline = insertClip(projectWithNarration().shorts[0].timeline, 'narr', voice, 0)
    const trimmed = trimClip(timeline, 'voice-1', 'end', 1500)
    expect(trimmed.tracks[1].clips[0].durationMs).toBe(1500)
    expect(trimmed.tracks[1].clips[0].narration).toEqual({ source: 'recorded' })
  })

  it('sets volume and fades on a narration clip', () => {
    const timeline = insertClip(projectWithNarration().shorts[0].timeline, 'narr', voice, 0)
    const faded = setClipAudio(timeline, 'voice-1', { gain: 0.5, fadeInMs: 300, fadeOutMs: 400 })
    expect(faded.tracks[1].clips[0]).toMatchObject({ gain: 0.5, fadeInMs: 300, fadeOutMs: 400 })
  })
})

describe('narration commands in the history', () => {
  it('adds a narration clip, then undoes and redoes it', () => {
    const store = createHistoryStore(projectWithNarration())
    const add = timelineCommand('s1', 'Add narration clip', NOW, (timeline) =>
      insertClip(timeline, 'narr', voice, 0)
    )
    expect(store.getState().execute(add)).toBe(true)
    expect(narrationClips(store.getState().present)).toHaveLength(1)

    expect(store.getState().undo()).toBe(true)
    expect(narrationClips(store.getState().present)).toHaveLength(0)

    expect(store.getState().redo()).toBe(true)
    expect(narrationClips(store.getState().present)).toEqual([
      expect.objectContaining({ id: 'voice-1', narration: { source: 'recorded' } })
    ])
  })

  it('folds a volume drag into one undo step that restores the original gain', () => {
    const store = createHistoryStore(projectWithNarration())
    const add = timelineCommand('s1', 'Add narration clip', NOW, (timeline) =>
      insertClip(timeline, 'narr', voice, 0)
    )
    store.getState().execute(add)
    for (const gain of [0.8, 0.6, 0.4]) {
      store
        .getState()
        .execute(
          timelineCommand(
            's1',
            'Change clip volume',
            NOW,
            (timeline) => setClipAudio(timeline, 'voice-1', { gain }),
            'volume:voice-1'
          )
        )
    }
    expect(store.getState().past.map((entry) => entry.label)).toEqual([
      'Add narration clip',
      'Change clip volume'
    ])
    expect(store.getState().undo()).toBe(true)
    expect(narrationClips(store.getState().present)[0].gain).toBeUndefined()
  })
})
