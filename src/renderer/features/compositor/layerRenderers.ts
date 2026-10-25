// The renderer-side layer registry. Each track kind has a renderer here, and the compositor passes
// each layer its source (the decoded video element, or why there is none). Caption and overlay
// renderers register against the same registry in Epics 11 and 13.
import { LayerRegistry } from '@shared/compositor/layerRegistry'
import type { FrameLayer } from '@shared/compositor/frame'
import type { FrameBackend } from './frameBackend'
import { textBitmap } from './textBitmap'
import { captionBitmap } from './captionBitmap'

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
      if (source.state !== 'ready') return
      const opacity = layer.fade?.opacity ?? 1
      const { render } = layer
      if (render.mode === 'blurFit') {
        // The blurred, dimmed copy first, then the whole source over it.
        context.backend.drawVideo(
          source.element,
          render.background,
          {
            blurPx: render.blurPx,
            dim: render.dim
          },
          opacity
        )
        context.backend.drawVideo(source.element, render.foreground, undefined, opacity)
        return
      }
      context.backend.drawVideo(source.element, layer.placement, undefined, opacity)
    },
    { transformable: true }
  )
  // A text overlay is drawn as a bitmap at the position its description gives. It is transformable, but the
  // gizmo moves and scales its text item, not the clip's transform (see useCanvasGizmo).
  registry.register(
    'text',
    (layer, context) => {
      const text = layer.text
      if (!text) return
      const bitmap = textBitmap(text)
      context.backend.drawBitmap(
        bitmap,
        {
          centerX: text.centerX,
          centerY: text.centerY,
          width: bitmap.width * text.motionScale,
          height: bitmap.height * text.motionScale,
          rotationDeg: 0
        },
        text.alpha
      )
    },
    { transformable: true }
  )
  // A caption block is drawn as a bitmap at its description's centre, scaled by its pop-in. Like text,
  // it is not transformable: its position comes from the captions layout, not from a clip transform.
  registry.register('caption', (layer, context) => {
    const captions = layer.captions
    if (!captions) return
    const bitmap = captionBitmap(captions)
    context.backend.drawBitmap(
      bitmap,
      {
        centerX: captions.centerX,
        centerY: captions.centerY,
        width: bitmap.width * captions.scale,
        height: bitmap.height * captions.scale,
        rotationDeg: 0
      },
      1
    )
  })
  return registry
}

// The registry the preview uses. It also answers which layer kinds the canvas gizmo may transform.
export const layerRegistry = createLayerRegistry()
