import { describe, expect, it } from 'vitest'
import { describeFrame, CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/compositor/frame'
import { imageItemSchema, IMAGE_OVERLAY_DEFAULT_MS } from '@shared/image/imageItem'
import { describeImageOverlay, imageOverlayOf } from '@shared/image/imageOverlay'
import { footageClipForDrop } from '@shared/timeline/footageDrop'
import { clipSchema, IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'
import { updateClipImageItem } from '@shared/timeline/edits'
import { resolveFrame } from '@shared/timeline/resolveFrame'
import { selectionHeaderFor, selectionTypeFor } from '@renderer/features/inspector/inspectorModel'
import { TEXT_MOTION_DEFAULT_MS } from '@shared/text/textMotion'
import type { MediaRef } from '@shared/project/schema'
import type { DragPayload } from '@shared/timeline/dragPayload'

const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
const base = { centerX: 540, centerY: 960, width: 400, height: 200, rotationDeg: 0 }

// A 500 by 500 picture on an overlay track, starting at 1000 ms and lasting 2000 ms.
function imageTimeline(imageItem: unknown = {}, transform = IDENTITY_TRANSFORM): Timeline {
  return {
    tracks: [
      {
        id: 'ov',
        kind: 'overlay',
        role: 'overlay',
        muted: false,
        clips: [
          clipSchema.parse({
            id: 'img',
            mediaId: 'm1',
            startMs: 1000,
            durationMs: 2000,
            sourceInMs: 0,
            transform,
            imageItem
          })
        ]
      }
    ]
  }
}

const square = () => ({ width: 500, height: 500 })

describe('image overlay model', () => {
  it('validates the item and bounds the opacity', () => {
    expect(imageItemSchema.safeParse({ opacity: 0.5, enter: 'fade' }).success).toBe(true)
    expect(imageItemSchema.safeParse({ opacity: 1.5 }).success).toBe(false)
    expect(imageItemSchema.safeParse({ enter: 'spin' }).success).toBe(false)
  })

  it('reads a missing opacity as solid and multiplies it into the alpha', () => {
    const solid = describeImageOverlay(base, {}, 1000, 2000, canvas)
    expect(solid.alpha).toBe(1)
    const half = describeImageOverlay(base, { opacity: 0.5 }, 1000, 2000, canvas, 0.5)
    expect(half.alpha).toBeCloseTo(0.25)
  })

  it('fades in from nothing at the clip start and holds the placement with no motion', () => {
    const item = { enter: 'fade' as const }
    expect(describeImageOverlay(base, item, 0, 2000, canvas).alpha).toBe(0)
    const settled = describeImageOverlay(base, item, TEXT_MOTION_DEFAULT_MS, 2000, canvas)
    expect(settled.alpha).toBe(1)
    expect(settled.placement).toEqual(base)
  })

  it('slides from the left by a fraction of the canvas width and scales a pop', () => {
    const slid = describeImageOverlay(base, { enter: 'slide-left' }, 0, 2000, canvas)
    expect(slid.placement.centerX).toBeLessThan(base.centerX)
    expect(slid.placement.centerY).toBe(base.centerY)
    const popped = describeImageOverlay(base, { enter: 'pop' }, 0, 2000, canvas)
    expect(popped.placement.width).toBeCloseTo(0)
  })

  it('finds an image overlay only on an overlay track', () => {
    const timeline = imageTimeline()
    expect(imageOverlayOf(timeline, 'img')?.clip.imageItem).toEqual({})
    const text: Timeline = {
      tracks: [{ ...timeline.tracks[0], kind: 'video', role: 'main' }]
    }
    expect(imageOverlayOf(text, 'img')).toBeNull()
  })

  it('resolves the item and places the layer at the clip transform in describeFrame', () => {
    const timeline = imageTimeline({ enter: 'fade' }, { ...IDENTITY_TRANSFORM, x: 100 })
    const [layer] = resolveFrame(timeline, 1000)
    expect(layer?.imageItem).toEqual({ enter: 'fade' })
    const start = describeFrame(timeline, 1000, square).layers[0]
    expect(start?.image?.alpha).toBe(0)
    expect(start?.placement.centerX).toBe(CANVAS_WIDTH / 2 + 100)
    const settled = describeFrame(timeline, 1000 + TEXT_MOTION_DEFAULT_MS, square).layers[0]
    expect(settled?.image?.alpha).toBe(1)
    expect(settled?.placement.width).toBeCloseTo(CANVAS_WIDTH)
  })
})

describe('image drops', () => {
  const images: MediaRef[] = [
    {
      id: 'pic',
      path: 'C:/logo.png',
      pathKind: 'absolute',
      fileName: 'logo.png',
      sizeBytes: 10,
      kind: 'image'
    },
    {
      id: 'clip',
      path: 'C:/a.mp4',
      pathKind: 'absolute',
      fileName: 'a.mp4',
      sizeBytes: 10,
      kind: 'video'
    }
  ]
  const overlay = {
    id: 'ov',
    kind: 'overlay' as const,
    role: 'overlay' as const,
    muted: false,
    clips: []
  }
  const payload = (mediaId: string): DragPayload => ({
    kind: 'clip',
    mediaId,
    inMs: 0,
    outMs: 50
  })

  it('places an image on an overlay track with a default length and an empty item', () => {
    const result = footageClipForDrop(payload('pic'), images, overlay, 'new', 500)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.clip.durationMs).toBe(IMAGE_OVERLAY_DEFAULT_MS)
    expect(result.clip.imageItem).toEqual({})
    expect(result.clip.startMs).toBe(500)
  })

  it('refuses video on an overlay track and images on a video track', () => {
    expect(footageClipForDrop(payload('clip'), images, overlay, 'new', 0).ok).toBe(false)
    const video = { ...overlay, kind: 'video' as const, role: 'main' as const }
    expect(footageClipForDrop(payload('pic'), images, video, 'new', 0).ok).toBe(false)
  })

  it('edits the item as one change and rejects a clip with no image item', () => {
    const timeline = imageTimeline({})
    const next = updateClipImageItem(timeline, 'img', (item) => ({ ...item, opacity: 0.4 }))
    expect(imageOverlayOf(next, 'img')?.clip.imageItem.opacity).toBe(0.4)
    const plain: Timeline = {
      tracks: [
        { ...timeline.tracks[0], clips: [{ ...timeline.tracks[0].clips[0], imageItem: undefined }] }
      ]
    }
    expect(() => updateClipImageItem(plain, 'img', (item) => item)).toThrow()
  })

  it('selects the image section for an image clip', () => {
    expect(selectionTypeFor(imageTimeline(), ['img'], null)).toBe('image-clip')
    expect(selectionHeaderFor('image-clip', 1)).toBe('Image clip')
    expect(selectionHeaderFor('image-clip', 2)).toBe('2 image clips')
  })
})
