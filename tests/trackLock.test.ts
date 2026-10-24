import { describe, expect, it } from 'vitest'
import { deleteClip, insertClip, setTrackFlag, TimelineEditError } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'

const clip = { id: 'a', startMs: 0, durationMs: 1000, sourceInMs: 0, transform: IDENTITY_TRANSFORM }

function locked(): Timeline {
  return {
    tracks: [{ id: 'main', kind: 'video', role: 'main', muted: false, locked: true, clips: [clip] }]
  }
}

describe('locked tracks', () => {
  it('refuses clip edits on a locked track', () => {
    expect(() => deleteClip(locked(), 'a')).toThrow(TimelineEditError)
    expect(() => insertClip(locked(), 'main', { ...clip, id: 'b' }, 2000)).toThrow(
      TimelineEditError
    )
  })

  it('still allows the flags to change, so the track can be unlocked', () => {
    const unlocked = setTrackFlag(locked(), 'main', 'locked', false)
    expect(deleteClip(unlocked, 'a').tracks[0].clips).toEqual([])
  })
})
