// Layer renderers, keyed by layer kind. The compositor walks a frame's layers in draw order and hands
// each one to the renderer registered for its kind. A layer's kind is its track kind, except caption
// layers (Epic 11, #119), which are kind 'caption' even though they sit on a text track. Layers with no
// renderer are skipped, so a kind can exist before its renderer does. Epic 13 registers the overlay
// renderer here. Generic over the context a renderer draws into, so this module stays free of DOM.
// A kind opts in to the canvas transform gizmo (move, scale, nudge) by registering as transformable.
import type { TrackKind } from '../timeline/timeline'
import type { FrameDescription, FrameLayer } from './frame'

export type LayerKind = TrackKind | 'caption'

// The kind a layer is drawn with. Caption layers carry their captions description.
export function layerKindOf(layer: FrameLayer): LayerKind {
  return layer.captions ? 'caption' : layer.trackKind
}

export type LayerRenderer<Context> = (layer: FrameLayer, context: Context) => void

export interface LayerOptions {
  // The layer can be selected and moved on the preview canvas.
  transformable?: boolean
}

export class LayerRegistry<Context> {
  private readonly renderers = new Map<LayerKind, LayerRenderer<Context>>()
  private readonly transformable = new Set<LayerKind>()

  // Returns a function that removes this registration again.
  register(
    kind: LayerKind,
    renderer: LayerRenderer<Context>,
    options: LayerOptions = {}
  ): () => void {
    if (this.renderers.has(kind)) {
      throw new Error(`A layer renderer is already registered for ${kind} layers.`)
    }
    this.renderers.set(kind, renderer)
    if (options.transformable) this.transformable.add(kind)
    return () => {
      if (this.renderers.get(kind) === renderer) this.renderers.delete(kind)
      this.transformable.delete(kind)
    }
  }

  has(kind: LayerKind): boolean {
    return this.renderers.has(kind)
  }

  // True when a layer of this kind can be selected and transformed on the canvas.
  supportsTransform(kind: LayerKind): boolean {
    return this.renderers.has(kind) && this.transformable.has(kind)
  }

  renderFrame(frame: FrameDescription, context: Context): void {
    for (const layer of frame.layers) {
      this.renderers.get(layerKindOf(layer))?.(layer, context)
    }
  }
}
