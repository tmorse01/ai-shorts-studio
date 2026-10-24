// Layer renderers, keyed by track kind. The compositor walks a frame's layers in draw order and hands
// each one to the renderer registered for its track kind. Layers with no renderer are skipped, so a
// track kind can exist before its renderer does. Epics 11 and 13 register caption and overlay
// renderers here. Generic over the context a renderer draws into, so this module stays free of DOM.
import type { TrackKind } from '../timeline/timeline'
import type { FrameDescription, FrameLayer } from './frame'

export type LayerRenderer<Context> = (layer: FrameLayer, context: Context) => void

export class LayerRegistry<Context> {
  private readonly renderers = new Map<TrackKind, LayerRenderer<Context>>()

  // Returns a function that removes this registration again.
  register(kind: TrackKind, renderer: LayerRenderer<Context>): () => void {
    if (this.renderers.has(kind)) {
      throw new Error(`A layer renderer is already registered for ${kind} tracks.`)
    }
    this.renderers.set(kind, renderer)
    return () => {
      if (this.renderers.get(kind) === renderer) this.renderers.delete(kind)
    }
  }

  has(kind: TrackKind): boolean {
    return this.renderers.has(kind)
  }

  renderFrame(frame: FrameDescription, context: Context): void {
    for (const layer of frame.layers) {
      this.renderers.get(layer.trackKind)?.(layer, context)
    }
  }
}
