// Draws one frame description onto a backend. The layers come from the shared description and the
// per-kind renderers come from the registry. The compositor's own job is timing: if a video layer
// has not decoded its frame, it holds the last frame on screen rather than drawing a partial one.
import type { FrameDescription, FrameLayer } from '@shared/compositor/frame'
import type { LayerRegistry } from '@shared/compositor/layerRegistry'
import type { FrameBackend } from './frameBackend'
import { createLayerRegistry, type LayerContext, type LayerSource } from './layerRenderers'

export class Compositor {
  private hasFrame = false

  constructor(
    private readonly backend: FrameBackend,
    private readonly registry: LayerRegistry<LayerContext> = createLayerRegistry()
  ) {}

  // Returns false when the frame was held because a video layer is still pending. The frame drawn
  // last stays on screen until that layer decodes, and the next redraw picks it up.
  render(frame: FrameDescription, sourceOf: (layer: FrameLayer) => LayerSource): boolean {
    const sources = new Map<string, LayerSource>()
    let pending = false
    for (const layer of frame.layers) {
      if (layer.trackKind !== 'video' || !layer.mediaId) continue
      const source = sourceOf(layer)
      sources.set(layer.clipId, source)
      if (source.state === 'pending') pending = true
    }
    if (pending && this.hasFrame) return false

    this.backend.clear()
    this.registry.renderFrame(frame, {
      backend: this.backend,
      sourceOf: (layer) => sources.get(layer.clipId) ?? { state: 'none' }
    })
    this.hasFrame = true
    return true
  }

  dispose(): void {
    this.backend.dispose()
  }
}
