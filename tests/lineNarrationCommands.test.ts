import { describe, expect, it, vi } from 'vitest'
import type { MediaRef, Project } from '@shared/project/schema'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { lineClipCommand } from '@renderer/features/narration/lineNarrationCommands'
import {
  generateLineNarration,
  type LineSpeechDeps
} from '@renderer/features/narration/lineNarrationActions'

const NOW = '2026-10-25T10:00:00.000Z'

function baseProject(): Project {
  const timeline: Timeline = {
    tracks: [
      { id: 'main', kind: 'video', role: 'main', muted: false, clips: [] },
      { id: 'narr', kind: 'audio', role: 'narration', muted: false, clips: [] }
    ]
  }
  return {
    media: [],
    scripts: [
      {
        id: 'script-1',
        title: 'Script',
        topic: 'Topic',
        lines: [
          { id: 'l1', text: 'First line' },
          { id: 'l2', text: 'Second line' },
          { id: 'l3', text: 'Third line' }
        ]
      }
    ],
    shorts: [
      {
        id: 's1',
        scriptId: 'script-1',
        status: 'draft',
        updatedAt: '2026-10-24T09:00:00.000Z',
        editedSinceExport: false,
        timeline
      }
    ]
  } as unknown as Project
}

function lineClip(id: string, lineId: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    mediaId: `media-${id}`,
    startMs,
    durationMs,
    sourceInMs: 0,
    transform: { ...IDENTITY_TRANSFORM },
    narration: { source: 'recorded', scriptLineId: lineId }
  }
}

function narrationClips(project: Project): Clip[] {
  return project.shorts[0].timeline.tracks.find((track) => track.role === 'narration')?.clips ?? []
}

// A fake speech provider. The real one is never called in tests.
function fakeSpeech(overrides: Partial<LineSpeechDeps> = {}): LineSpeechDeps & {
  speak: ReturnType<typeof vi.fn>
  importAudio: ReturnType<typeof vi.fn>
} {
  const speak = vi.fn(async () => ({ audioPath: 'C:/proj/cache/tts/abc.mp3', cached: false }))
  const importAudio = vi.fn(async (path: string) => ({
    path,
    pathKind: 'absolute' as const,
    fileName: 'abc.mp3',
    sizeBytes: 1234,
    durationMs: 2500
  }))
  return { speak, importAudio, ...overrides } as LineSpeechDeps & {
    speak: ReturnType<typeof vi.fn>
    importAudio: ReturnType<typeof vi.fn>
  }
}

const generateInput = {
  shortId: 's1',
  scriptId: 'script-1',
  lineId: 'l1',
  lineText: 'First line',
  projectFolder: 'C:/proj',
  voiceId: 'voice-1',
  regenerate: false,
  now: NOW,
  clipId: 'gen-1',
  narrationTrackId: 'narr-unused',
  mediaId: 'media-gen-1'
}

describe('generated line narration', () => {
  it('speaks the line, places the clip on its line, and undoes and redoes it', async () => {
    const speech = fakeSpeech()
    const store = createHistoryStore(baseProject())
    const { command, cached } = await generateLineNarration(speech, generateInput)

    expect(cached).toBe(false)
    expect(speech.speak).toHaveBeenCalledWith({
      projectFolder: 'C:/proj',
      voiceId: 'voice-1',
      text: 'First line'
    })
    expect(store.getState().execute(command)).toBe(true)

    const [clip] = narrationClips(store.getState().present)
    expect(clip).toMatchObject({
      id: 'gen-1',
      mediaId: 'media-gen-1',
      startMs: 0,
      durationMs: 2500,
      narration: { source: 'tts', scriptLineId: 'l1', voiceId: 'voice-1', text: 'First line' }
    })
    expect(store.getState().present.media).toEqual([
      expect.objectContaining({
        id: 'media-gen-1',
        path: 'C:/proj/cache/tts/abc.mp3',
        kind: 'audio'
      })
    ])

    expect(store.getState().undo()).toBe(true)
    expect(narrationClips(store.getState().present)).toHaveLength(0)
    expect(store.getState().present.media).toEqual([])

    expect(store.getState().redo()).toBe(true)
    expect(narrationClips(store.getState().present)).toEqual([
      expect.objectContaining({ id: 'gen-1' })
    ])
  })

  it('regenerates only the chosen line and undo restores its old clip', async () => {
    const project = baseProject()
    project.shorts[0].timeline.tracks[1].clips = [
      lineClip('old-l1', 'l1', 0, 2000),
      lineClip('old-l2', 'l2', 2000, 1000)
    ]
    const store = createHistoryStore(project)
    const speech = fakeSpeech({
      importAudio: vi.fn(async (path: string) => ({
        path,
        pathKind: 'absolute' as const,
        fileName: 'new.mp3',
        sizeBytes: 900,
        durationMs: 1400
      }))
    })
    const { command } = await generateLineNarration(speech, {
      ...generateInput,
      lineId: 'l2',
      lineText: 'Second line',
      regenerate: true,
      clipId: 'new-l2',
      mediaId: 'media-new-l2'
    })
    expect(store.getState().execute(command)).toBe(true)

    const clips = narrationClips(store.getState().present)
    expect(clips.map((clip) => clip.id).sort()).toEqual(['new-l2', 'old-l1'])
    expect(clips.find((clip) => clip.id === 'old-l1')).toMatchObject({
      startMs: 0,
      durationMs: 2000
    })
    expect(clips.find((clip) => clip.id === 'new-l2')).toMatchObject({
      startMs: 2000,
      durationMs: 1400,
      narration: { source: 'tts', scriptLineId: 'l2' }
    })

    expect(store.getState().undo()).toBe(true)
    expect(
      narrationClips(store.getState().present)
        .map((clip) => clip.id)
        .sort()
    ).toEqual(['old-l1', 'old-l2'])
  })

  it('reuses a cached file already in the media list instead of adding it again', async () => {
    const project = baseProject()
    const cached: MediaRef = {
      id: 'media-cached',
      path: 'C:/proj/cache/tts/abc.mp3',
      pathKind: 'absolute',
      fileName: 'abc.mp3',
      sizeBytes: 1234,
      durationMs: 2500,
      kind: 'audio'
    }
    project.media = [cached]
    const store = createHistoryStore(project)
    const speech = fakeSpeech({
      speak: vi.fn(async () => ({ audioPath: 'C:/proj/cache/tts/abc.mp3', cached: true }))
    })
    const { command, cached: wasCached } = await generateLineNarration(speech, generateInput)
    expect(wasCached).toBe(true)
    store.getState().execute(command)
    expect(store.getState().present.media).toEqual([cached])
    expect(narrationClips(store.getState().present)[0].mediaId).toBe('media-cached')
  })

  it('refuses empty text before calling the provider', async () => {
    const speech = fakeSpeech()
    await expect(
      generateLineNarration(speech, { ...generateInput, lineText: '   ' })
    ).rejects.toThrow(/needs some text/)
    expect(speech.speak).not.toHaveBeenCalled()
  })
})

describe('recorded line narration', () => {
  it('adds the Narration lane when missing, places the take on its line, and undoes it', () => {
    const project = baseProject()
    project.shorts[0].timeline.tracks = project.shorts[0].timeline.tracks.filter(
      (track) => track.role !== 'narration'
    )
    const store = createHistoryStore(project)
    const command = lineClipCommand({
      shortId: 's1',
      scriptId: 'script-1',
      lineId: 'l3',
      label: 'Record line narration',
      now: NOW,
      clipId: 'take-1',
      narrationTrackId: 'narr-new',
      media: {
        id: 'media-take-1',
        path: 'C:/proj/media/narration/take.wav',
        pathKind: 'absolute',
        fileName: 'take.wav',
        sizeBytes: 5000,
        kind: 'audio'
      },
      durationMs: 3000,
      source: 'recorded',
      text: 'Third line'
    })
    expect(store.getState().execute(command)).toBe(true)

    const timeline = store.getState().present.shorts[0].timeline
    expect(timeline.tracks.find((track) => track.role === 'narration')?.id).toBe('narr-new')
    expect(narrationClips(store.getState().present)).toEqual([
      expect.objectContaining({
        id: 'take-1',
        startMs: 0,
        durationMs: 3000,
        narration: { source: 'recorded', scriptLineId: 'l3', text: 'Third line' }
      })
    ])

    expect(store.getState().undo()).toBe(true)
    expect(
      store.getState().present.shorts[0].timeline.tracks.some((track) => track.role === 'narration')
    ).toBe(false)
    expect(store.getState().redo()).toBe(true)
    expect(narrationClips(store.getState().present)).toHaveLength(1)
  })
})
