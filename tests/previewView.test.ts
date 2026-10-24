import { describe, expect, it } from 'vitest'
import { previewSettingsStore } from '@renderer/features/preview/previewSettingsStore'
import { shortPlatformSchema } from '@shared/project/schema'
import {
  ACTUAL_FRAME_SIZE,
  canPan,
  clampPan,
  panBy,
  panLimits,
  resolveSafeZones,
  safeZoneInsets,
  SAFE_ZONE_INSETS
} from '@shared/preview/previewView'

const PLATFORMS = shortPlatformSchema.options

describe('safe-zone geometry', () => {
  it('keeps every platform guide inside the frame, with a clear middle', () => {
    for (const platform of PLATFORMS) {
      const insets = safeZoneInsets(platform)
      for (const value of Object.values(insets)) {
        expect(value).toBeGreaterThan(0)
        expect(value).toBeLessThan(0.5)
      }
      expect(insets.left + insets.right).toBeLessThan(1)
      expect(insets.top + insets.bottom).toBeLessThan(1)
    }
  })

  it('gives each platform its own guide area, with the bottom reserved most on Reels', () => {
    expect(SAFE_ZONE_INSETS.youtube).not.toEqual(SAFE_ZONE_INSETS.tiktok)
    expect(SAFE_ZONE_INSETS.reels.bottom).toBeGreaterThan(SAFE_ZONE_INSETS.youtube.bottom)
    expect(SAFE_ZONE_INSETS.reels.top).toBeGreaterThan(SAFE_ZONE_INSETS.tiktok.top)
  })

  it('shows the overlay when the session has no choice, and follows an explicit choice', () => {
    expect(resolveSafeZones(null, true)).toBe(true)
    expect(resolveSafeZones(null, false)).toBe(false)
    expect(resolveSafeZones(false, true)).toBe(false)
    expect(resolveSafeZones(true, false)).toBe(true)
  })
})

describe('zoom and pan', () => {
  const viewport = { width: 800, height: 600 }

  it('allows panning only at 100% when the frame is larger than the viewport', () => {
    expect(canPan('actual', ACTUAL_FRAME_SIZE, viewport)).toBe(true)
    expect(canPan('fit', ACTUAL_FRAME_SIZE, viewport)).toBe(false)
    expect(canPan('actual', ACTUAL_FRAME_SIZE, { width: 2000, height: 3000 })).toBe(false)
  })

  it('limits pan to the overflow on each side of the frame', () => {
    // 1080 - 800 = 280, so 140 each side. 1920 - 600 = 1320, so 660 each side.
    expect(panLimits(ACTUAL_FRAME_SIZE, viewport)).toEqual({ x: 140, y: 660 })
    expect(panLimits(ACTUAL_FRAME_SIZE, { width: 2000, height: 3000 })).toEqual({ x: 0, y: 0 })
  })

  it('clamps a pan that goes past the frame edge', () => {
    expect(clampPan({ x: 500, y: -900 }, ACTUAL_FRAME_SIZE, viewport)).toEqual({
      x: 140,
      y: -660
    })
    expect(clampPan({ x: 10, y: 20 }, ACTUAL_FRAME_SIZE, viewport)).toEqual({ x: 10, y: 20 })
  })

  it('moves the pan by a drag and stops at the edge', () => {
    const first = panBy({ x: 0, y: 0 }, { x: -50, y: 30 }, ACTUAL_FRAME_SIZE, viewport)
    expect(first).toEqual({ x: -50, y: 30 })
    const second = panBy(first, { x: -200, y: 0 }, ACTUAL_FRAME_SIZE, viewport)
    expect(second).toEqual({ x: -140, y: 30 })
  })

  it('keeps a frame that fits the viewport centred', () => {
    expect(panBy({ x: 0, y: 0 }, { x: 40, y: 40 }, { width: 300, height: 500 }, viewport)).toEqual({
      x: 0,
      y: 0
    })
  })
})

describe('preview view settings store', () => {
  it('starts at Fit with the overlay following the short, and keeps each choice', () => {
    const store = previewSettingsStore.getState()
    expect(store.zoom).toBe('fit')
    expect(store.safeZoneOverride).toBeNull()

    store.setZoom('actual')
    store.setSafeZoneOverride(false)
    expect(previewSettingsStore.getState().zoom).toBe('actual')
    expect(previewSettingsStore.getState().safeZoneOverride).toBe(false)

    store.setZoom('fit')
    store.setSafeZoneOverride(null)
  })
})
