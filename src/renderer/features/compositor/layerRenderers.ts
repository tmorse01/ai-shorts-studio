// The renderer-side layer registry. Each track kind has a renderer here, and the compositor passes
// each layer its source (the decoded video element, or why there is none). Caption and overlay
// renderers register against the same registry in Epics 11 and 13.
import { LayerRegistry } from '@shared/compositor/layerRegistry'
import type { FrameLayer } from '@shared/compositor/frame'
import type { FrameBackend } from './frameBackend'

// A video layer's source. "pending" means the element has not decoded its frame yet, so the
// compositor holds the last frame instead of drawing a partial one.
export type LayerSource =
  { state: 'ready'; element: HTMLVideoElement } | { state: 'pending' } | { state: 'none' }

export interface LayerContext {
  backend: FrameBackend
  sourceOf(layer: FrameLayer): LayerSource
}

export function createLayerRegistry(): LayerRegistry<LayerContext> {
  const registry = new LayerRegistry<LayerContext>()
  // Video opts in to the canvas gizmo: it can be selected, moved and scaled (the crop is its pan and
  // zoom inside the 9:16 frame).
  registry.register(
    'video',
    (layer, context) => {
      const source = context.sourceOf(layer)
      if (source.state === 'ready') context.backend.drawVideo(source.element, layer.placement)
    },
    { transformable: true }
  )
  return registry
}

// The registry the preview uses. It also answers which layer kinds the canvas gizmo may transform.
export const layerRegistry = createLayerRegistry()
