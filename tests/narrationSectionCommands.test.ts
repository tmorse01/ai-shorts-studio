import { describe, expect, it } from 'vitest'
import type { MediaRef, Project } from '@shared/project/schema'
import { IDENTITY_TRANSFORM, type Clip } from '@shared/timeline/timeline'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import {
  narrationFieldsCommand,
  regenerateNarrationCommand
} from '@renderer/features/narration/narrationSectionCommands'

const NOW = '2026-10-24T10:00:00.000Z'

const clip: Clip = {
  id: 'narr-clip',
  mediaId: 'old-media',
  startMs: 0,
  durationMs: 1000,
  sourceInMs: 0,
  transform: { ...IDENTITY_TRANSFORM },
  narration: { source: 'tts', voiceId: 'voice-1', text: 'Hello', scriptLineId: 'line-1' }
}

const oldMedia: MediaRef = {
  id: 'old-media',
  path: 'media/narration/old.mp3',
  pathKind: 'relative',
  fileName: 'old.mp3',
  sizeBytes: 1000,
  durationMs: 1000,
  kind: 'audio'
}

function project(): Project {
  return {
    media: [oldMedia],
    shorts: [
      {
        id: 's1',
        status: 'draft',
        updatedAt: '2026-10-23T09:00:00.000Z',
        editedSinceExport: false,
        timeline: {
          tracks: [
            { id: 'main', kind: 'video', role: 'main', muted: false, clips: [] },
            { id: 'narr', kind: 'audio', role: 'narration', muted: false, clips: [clip] }
          ]
        }
      }
    ]
  } as unknown as Project
}

function narrationClipOf(value: Project) {
  return value.shorts[0].timeline.tracks.find((track) => track.role === 'narration')?.clips[0]
}

const newMedia: MediaRef = {
  id: 'new-media',
  path: 'C:/cache/abc.mp3',
  pathKind: 'absolute',
  fileName: 'abc.mp3',
  sizeBytes: 2000,
  durationMs: 2500,
  kind: 'audio'
}

describe('editing narration fields as one undoable command', () => {
  it('changes the voice, and undo and redo bring it back and forth', () => {
    const store = createHistoryStore(project())
    const command = narrationFieldsCommand({
      shortId: 's1',
      clipId: 'narr-clip',
      label: 'Change narration voice',
      now: NOW,
      change: { voiceId: 'voice-2' }
    })
    expect(store.getState().execute(command)).toBe(true)
    expect(narrationClipOf(store.getState().present)?.narration?.voiceId).toBe('voice-2')

    expect(store.getState().undo()).toBe(true)
    expect(narrationClipOf(store.getState().present)?.narration?.voiceId).toBe('voice-1')

    expect(store.getState().redo()).toBe(true)
    expect(narrationClipOf(store.getState().present)?.narration?.voiceId).toBe('voice-2')
  })

  it('unlinks the script line, and undo restores it', () => {
    const store = createHistoryStore(project())
    store.getState().execute(
      narrationFieldsCommand({
        shortId: 's1',
        clipId: 'narr-clip',
        label: 'Link script line',
        now: NOW,
        change: { scriptLineId: null }
      })
    )
    expect(narrationClipOf(store.getState().present)?.narration).not.toHaveProperty('scriptLineId')

    store.getState().undo()
    expect(narrationClipOf(store.getState().present)?.narration?.scriptLineId).toBe('line-1')
  })
})

describe('regenerating narration audio as one undoable command', () => {
  function regenerate() {
    return regenerateNarrationCommand({
      shortId: 's1',
      clipId: 'narr-clip',
      now: NOW,
      media: newMedia,
      durationMs: 2500,
      voiceId: 'voice-1',
      text: 'Hello there.'
    })
  }

  it('adds the new file and points the clip at it', () => {
    const store = createHistoryStore(project())
    expect(store.getState().execute(regenerate())).toBe(true)

    const value = store.getState().present
    expect(value.media.map((item) => item.id)).toEqual(['old-media', 'new-media'])
    expect(narrationClipOf(value)).toMatchObject({
      mediaId: 'new-media',
      durationMs: 2500,
      narration: { source: 'tts', voiceId: 'voice-1', text: 'Hello there.' }
    })
  })

  it('undo puts the old audio back and drops the new file; redo brings both back', () => {
    const store = createHistoryStore(project())
    store.getState().execute(regenerate())

    expect(store.getState().undo()).toBe(true)
    const undone = store.getState().present
    expect(undone.media).toEqual([oldMedia])
    expect(narrationClipOf(undone)).toMatchObject({
      mediaId: 'old-media',
      durationMs: 1000,
      narration: { voiceId: 'voice-1', text: 'Hello' }
    })

    expect(store.getState().redo()).toBe(true)
    const redone = store.getState().present
    expect(redone.media.map((item) => item.id)).toEqual(['old-media', 'new-media'])
    expect(narrationClipOf(redone)?.mediaId).toBe('new-media')
  })

  it('reuses a file the project already lists at the same path, so cached audio adds no copy', () => {
    const value = project()
    value.media.push({ ...newMedia, id: 'listed-media' })
    const store = createHistoryStore(value)
    store.getState().execute(regenerate())

    const after = store.getState().present
    expect(after.media.filter((item) => item.path === newMedia.path)).toHaveLength(1)
    expect(narrationClipOf(after)?.mediaId).toBe('listed-media')
  })
})
