import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/project/schema'
import { updateClipTransform, TimelineEditError } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'
import { LayerRegistry } from '@shared/compositor/layerRegistry'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { transformCommand } from '@renderer/features/compositor/layerTransformCommands'
import { layerRegistry } from '@renderer/features/compositor/layerRenderers'

const NOW = '2026-10-24T10:00:00.000Z'

function timelineWith(locked: boolean): Timeline {
  return {
    tracks: [
      {
        id: 'main',
        kind: 'video',
        role: 'main',
        muted: false,
        locked,
        clips: [
          {
            id: 'a',
            mediaId: 'm1',
            startMs: 0,
            durationMs: 1000,
            sourceInMs: 0,
            transform: IDENTITY_TRANSFORM
          }
        ]
      }
    ]
  }
}

function projectWith(): Project {
  return {
    shorts: [
      {
        id: 's1',
        status: 'draft',
        updatedAt: '2026-10-23T09:00:00.000Z',
        editedSinceExport: false,
        timeline: timelineWith(false)
      }
    ]
  } as unknown as Project
}

describe('updateClipTransform', () => {
  it('sets the transform of one clip from the stored value', () => {
    const next = updateClipTransform(timelineWith(false), 'a', (transform) => ({
      ...transform,
      x: transform.x + 12
    }))
    expect(next.tracks[0].clips[0].transform.x).toBe(12)
  })

  it('refuses an edit on a locked track', () => {
    expect(() =>
      updateClipTransform(timelineWith(true), 'a', (transform) => ({ ...transform, x: 5 }))
    ).toThrow(TimelineEditError)
  })

  it('refuses a transform with no scale', () => {
    expect(() =>
      updateClipTransform(timelineWith(false), 'a', (transform) => ({ ...transform, scale: 0 }))
    ).toThrow(TimelineEditError)
  })
})

describe('layer registry transform opt-in', () => {
  it('lets only registered transformable kinds be transformed', () => {
    const registry = new LayerRegistry<null>()
    registry.register('video', () => undefined, { transformable: true })
    registry.register('text', () => undefined)
    expect(registry.supportsTransform('video')).toBe(true)
    expect(registry.supportsTransform('text')).toBe(false)
    expect(registry.supportsTransform('audio')).toBe(false)
  })

  it('opts video in on the preview registry', () => {
    expect(layerRegistry.supportsTransform('video')).toBe(true)
    expect(layerRegistry.supportsTransform('overlay')).toBe(false)
  })
})

describe('transform commands in the history', () => {
  it('folds one drag into a single undo step', () => {
    let clock = 0
    const history = createHistoryStore(projectWith(), { now: () => clock })
    for (const x of [10, 20, 30]) {
      clock += 100
      history
        .getState()
        .execute(transformCommand('s1', 'a', 'Move layer', 'gizmo:a:1', (t) => ({ ...t, x }), NOW))
    }
    expect(history.getState().past).toHaveLength(1)
    expect(history.getState().present.shorts[0].timeline.tracks[0].clips[0].transform.x).toBe(30)

    expect(history.getState().undo()).toBe(true)
    expect(history.getState().present.shorts[0].timeline.tracks[0].clips[0].transform.x).toBe(0)
    expect(history.getState().past).toHaveLength(0)
  })

  it('keeps two drags apart when their keys differ', () => {
    let clock = 0
    const history = createHistoryStore(projectWith(), { now: () => clock })
    history
      .getState()
      .execute(
        transformCommand('s1', 'a', 'Move layer', 'gizmo:a:1', (t) => ({ ...t, x: 10 }), NOW)
      )
    clock += 50
    history
      .getState()
      .execute(
        transformCommand('s1', 'a', 'Move layer', 'gizmo:a:2', (t) => ({ ...t, x: 20 }), NOW)
      )
    expect(history.getState().past).toHaveLength(2)
  })
})
