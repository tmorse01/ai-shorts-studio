import { describe, expect, it } from 'vitest'
import { describeFrame, type FrameDescription } from '@shared/compositor/frame'
import { LayerRegistry } from '@shared/compositor/layerRegistry'
import type { Timeline } from '@shared/timeline/timeline'
import { Compositor } from '../src/renderer/features/compositor/compositor'
import type { FrameBackend } from '../src/renderer/features/compositor/frameBackend'
import {
  createLayerRegistry,
  type LayerContext,
  type LayerSource
} from '../src/renderer/features/compositor/layerRenderers'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function video(id: string, startMs: number, mediaId: string): Timeline['tracks'][number] {
  return {
    id,
    kind: 'video',
    role: 'main',
    muted: false,
    clips: [
      { id: `${id}-clip`, mediaId, startMs, durationMs: 1000, sourceInMs: 0, transform: IDENTITY }
    ]
  }
}

function fakeBackend() {
  const log: string[] = []
  const backend: FrameBackend = {
    kind: '2d',
    clear: () => log.push('clear'),
    drawVideo: (element) => log.push(`draw:${(element as unknown as { name: string }).name}`),
    dispose: () => undefined
  }
  return { backend, log }
}

function element(name: string, ready: boolean): HTMLVideoElement {
  return {
    name,
    readyState: ready ? 2 : 0,
    videoWidth: ready ? 1920 : 0,
    error: null
  } as unknown as HTMLVideoElement
}

// Sources by clip id: a ready element, a pending one, or none.
function sourcesFor(map: Record<string, LayerSource>) {
  return (layer: { clipId: string }) => map[layer.clipId] ?? { state: 'none' as const }
}

describe('LayerRegistry', () => {
  it('draws each layer with the renderer for its track kind, in frame order', () => {
    const registry = new LayerRegistry<string[]>()
    registry.register('video', (layer, seen) => seen.push(`video:${layer.clipId}`))
    registry.register('text', (layer, seen) => seen.push(`text:${layer.clipId}`))
    const timelineValue: Timeline = {
      tracks: [
        video('v', 0, 'm1'),
        {
          id: 't',
          kind: 'text',
          role: 'text',
          muted: false,
          clips: [
            {
              id: 't-clip',
              startMs: 0,
              durationMs: 1000,
              sourceInMs: 0,
              transform: IDENTITY,
              text: 'Hi'
            }
          ]
        }
      ]
    }
    const seen: string[] = []
    registry.renderFrame(describeFrame(timelineValue, 500), seen)
    expect(seen).toEqual(['video:v-clip', 'text:t-clip'])
  })

  it('skips layers whose track kind has no renderer yet', () => {
    const registry = new LayerRegistry<string[]>()
    const seen: string[] = []
    registry.renderFrame(
      describeFrame(
        {
          tracks: [
            {
              id: 'o',
              kind: 'overlay',
              role: 'overlay',
              muted: false,
              clips: [
                { id: 'o-clip', startMs: 0, durationMs: 100, sourceInMs: 0, transform: IDENTITY }
              ]
            }
          ]
        },
        0
      ),
      seen
    )
    expect(seen).toEqual([])
  })

  it('refuses a second renderer for the same track kind', () => {
    const registry = new LayerRegistry<void>()
    registry.register('overlay', () => undefined)
    expect(() => registry.register('overlay', () => undefined)).toThrow(/already registered/)
  })

  it('removes a renderer through the function register returns', () => {
    const registry = new LayerRegistry<void>()
    const remove = registry.register('text', () => undefined)
    remove()
    expect(registry.has('text')).toBe(false)
  })
})

describe('Compositor', () => {
  const frameOf = (timelineValue: Timeline, tMs: number): FrameDescription =>
    describeFrame(timelineValue, tMs)

  it('clears and draws every ready video layer', () => {
    const { backend, log } = fakeBackend()
    const compositor = new Compositor(backend, createLayerRegistry())
    const timelineValue: Timeline = { tracks: [video('v1', 0, 'm1'), video('v2', 0, 'm2')] }
    const drawn = compositor.render(
      frameOf(timelineValue, 100),
      sourcesFor({
        'v1-clip': { state: 'ready', element: element('one', true) },
        'v2-clip': { state: 'ready', element: element('two', true) }
      })
    )
    expect(drawn).toBe(true)
    expect(log).toEqual(['clear', 'draw:one', 'draw:two'])
  })

  it('holds the last frame while a video layer is still pending', () => {
    const { backend, log } = fakeBackend()
    const compositor = new Compositor(backend, createLayerRegistry())
    const timelineValue: Timeline = { tracks: [video('v1', 0, 'm1')] }
    compositor.render(
      frameOf(timelineValue, 100),
      sourcesFor({ 'v1-clip': { state: 'ready', element: element('one', true) } })
    )
    log.length = 0

    const drawn = compositor.render(
      frameOf(timelineValue, 200),
      sourcesFor({ 'v1-clip': { state: 'pending' } })
    )
    expect(drawn).toBe(false)
    expect(log).toEqual([])
  })

  it('draws the first frame even when a layer is pending, so the preview is never blank for good', () => {
    const { backend, log } = fakeBackend()
    const compositor = new Compositor(backend, createLayerRegistry())
    const timelineValue: Timeline = { tracks: [video('v1', 0, 'm1')] }
    const drawn = compositor.render(
      frameOf(timelineValue, 100),
      sourcesFor({ 'v1-clip': { state: 'pending' } })
    )
    expect(drawn).toBe(true)
    expect(log).toEqual(['clear'])
  })

  it('clears the canvas over a gap with no clips', () => {
    const { backend, log } = fakeBackend()
    const compositor = new Compositor(backend, createLayerRegistry())
    const timelineValue: Timeline = { tracks: [video('v1', 0, 'm1')] }
    compositor.render(
      frameOf(timelineValue, 100),
      sourcesFor({ 'v1-clip': { state: 'ready', element: element('one', true) } })
    )
    log.length = 0
    const drawn = compositor.render(frameOf(timelineValue, 5000), sourcesFor({}))
    expect(drawn).toBe(true)
    expect(log).toEqual(['clear'])
  })

  it('hands non-video layers to the renderers registered on the registry', () => {
    const { backend } = fakeBackend()
    const registry = new LayerRegistry<LayerContext>()
    const seen: string[] = []
    registry.register('text', (layer) => seen.push(layer.clipId))
    const compositor = new Compositor(backend, registry)
    const timelineValue: Timeline = {
      tracks: [
        {
          id: 't',
          kind: 'text',
          role: 'text',
          muted: false,
          clips: [
            {
              id: 'caption',
              startMs: 0,
              durationMs: 1000,
              sourceInMs: 0,
              transform: IDENTITY,
              text: 'Hi'
            }
          ]
        }
      ]
    }
    compositor.render(frameOf(timelineValue, 0), sourcesFor({}))
    expect(seen).toEqual(['caption'])
  })
})
