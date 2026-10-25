import { describe, expect, it } from 'vitest'
import type { Narration } from '@shared/timeline/narration'
import { IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'
import { MAX_SPEECH_CHARS } from '@shared/tts/speech'
import {
  narrationClipFor,
  narrationFieldsFor,
  regenerateRequestFor,
  replaceNarrationAudio,
  updateClipNarration
} from '@renderer/features/narration/narrationClipEdits'

function narrationClip(id: string, narration: Narration): Clip {
  return {
    id,
    mediaId: 'media-1',
    startMs: 0,
    durationMs: 1000,
    sourceInMs: 0,
    transform: { ...IDENTITY_TRANSFORM },
    narration
  }
}

function timelineWith(narrationClips: Clip[]): Timeline {
  return {
    tracks: [
      { id: 'main', kind: 'video', role: 'main', muted: false, clips: [] },
      { id: 'narr', kind: 'audio', role: 'narration', muted: false, clips: narrationClips }
    ]
  }
}

const TTS: Narration = {
  source: 'tts',
  voiceId: 'voice-1',
  text: '  Hello there.  ',
  scriptLineId: 'line-1'
}

describe('the fields a narration clip shows', () => {
  it('shows source, script line and text for a recorded or imported clip', () => {
    expect(narrationFieldsFor({ source: 'recorded' })).toEqual(['source', 'scriptLine', 'text'])
    expect(narrationFieldsFor({ source: 'imported' })).toEqual(['source', 'scriptLine', 'text'])
  })

  it('adds voice and regenerate for a text to speech clip', () => {
    expect(narrationFieldsFor(TTS)).toEqual(['source', 'scriptLine', 'text', 'voice', 'regenerate'])
  })
})

describe('the regenerate request built from a clip', () => {
  it('speaks the trimmed text in the clip voice, in the project folder', () => {
    expect(regenerateRequestFor('/projects/p1', TTS)).toEqual({
      projectFolder: '/projects/p1',
      voiceId: 'voice-1',
      text: 'Hello there.'
    })
  })

  it('is null without a voice', () => {
    expect(regenerateRequestFor('/projects/p1', { source: 'tts', text: 'Hi' })).toBeNull()
  })

  it('is null when the text is empty or only spaces', () => {
    expect(regenerateRequestFor('/projects/p1', { ...TTS, text: '' })).toBeNull()
    expect(regenerateRequestFor('/projects/p1', { ...TTS, text: '   ' })).toBeNull()
    expect(regenerateRequestFor('/projects/p1', { source: 'tts', voiceId: 'v' })).toBeNull()
  })

  it('is null when the text is longer than the provider takes in one request', () => {
    const long = 'a'.repeat(MAX_SPEECH_CHARS + 1)
    expect(regenerateRequestFor('/projects/p1', { ...TTS, text: long })).toBeNull()
  })
})

describe('finding a narration clip', () => {
  it('returns a clip on the Narration lane that has narration details', () => {
    const timeline = timelineWith([narrationClip('n1', TTS)])
    expect(narrationClipFor(timeline, 'n1')?.id).toBe('n1')
  })

  it('returns null for a clip on another lane, or a clip with no narration details', () => {
    const timeline = timelineWith([{ ...narrationClip('n2', TTS), narration: undefined }])
    expect(narrationClipFor(timeline, 'n2')).toBeNull()
    expect(narrationClipFor(timeline, 'missing')).toBeNull()
  })
})

describe('editing the narration fields of a clip', () => {
  it('sets the script line, voice and text, and leaves the rest as it was', () => {
    const timeline = timelineWith([narrationClip('n1', TTS)])
    const next = updateClipNarration(timeline, 'n1', {
      scriptLineId: 'line-2',
      voiceId: 'voice-2',
      text: 'New words.'
    })
    expect(next.tracks[1].clips[0].narration).toEqual({
      source: 'tts',
      scriptLineId: 'line-2',
      voiceId: 'voice-2',
      text: 'New words.'
    })
  })

  it('unlinks the script line when given null', () => {
    const timeline = timelineWith([narrationClip('n1', TTS)])
    const next = updateClipNarration(timeline, 'n1', { scriptLineId: null })
    expect(next.tracks[1].clips[0].narration).not.toHaveProperty('scriptLineId')
  })

  it('does not change the original timeline', () => {
    const timeline = timelineWith([narrationClip('n1', TTS)])
    updateClipNarration(timeline, 'n1', { text: 'Changed' })
    expect(timeline.tracks[1].clips[0].narration?.text).toBe('  Hello there.  ')
  })

  it('refuses a clip that is not a narration clip, or that is missing', () => {
    const timeline = timelineWith([{ ...narrationClip('n2', TTS), narration: undefined }])
    expect(() => updateClipNarration(timeline, 'n2', { text: 'x' })).toThrow()
    expect(() => updateClipNarration(timeline, 'missing', { text: 'x' })).toThrow()
  })
})

describe('replacing the audio of a narration clip', () => {
  it('points the clip at the new file, takes its length and records the voice and text', () => {
    const timeline = timelineWith([narrationClip('n1', { source: 'recorded' })])
    const next = replaceNarrationAudio(timeline, 'n1', {
      mediaId: 'media-2',
      durationMs: 2499.6,
      voiceId: 'voice-1',
      text: 'Hello there.'
    })
    expect(next.tracks[1].clips[0]).toMatchObject({
      mediaId: 'media-2',
      sourceInMs: 0,
      durationMs: 2500,
      narration: { source: 'tts', voiceId: 'voice-1', text: 'Hello there.' }
    })
  })
})
