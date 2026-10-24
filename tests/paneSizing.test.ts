import { describe, expect, it } from 'vitest'
import { clampPaneSize, isNarrowWidth, PANE_LIMITS } from '@renderer/features/layout/paneSizing'

describe('clampPaneSize', () => {
  it('keeps a size that is already in range', () => {
    expect(clampPaneSize('left', 320, 1920)).toBe(320)
  })

  it('stops a pane at its minimum and maximum', () => {
    expect(clampPaneSize('left', 10, 1920)).toBe(PANE_LIMITS.left.min)
    expect(clampPaneSize('left', 9999, 1920)).toBe(PANE_LIMITS.left.max)
  })

  it('leaves the centre canvas its minimum width', () => {
    // 800px window: the centre needs 480px, so a side pane gets at most 320px.
    expect(clampPaneSize('left', 520, 800)).toBe(320)
  })

  it('never goes below the pane minimum, even when the window is too small', () => {
    expect(clampPaneSize('right', 400, 500)).toBe(PANE_LIMITS.right.min)
  })

  it('rounds to whole pixels', () => {
    expect(clampPaneSize('bottom', 200.6, 900)).toBe(201)
  })
})

describe('isNarrowWidth', () => {
  it('treats widths below 1440px as narrow', () => {
    expect(isNarrowWidth(1280)).toBe(true)
    expect(isNarrowWidth(1439)).toBe(true)
  })

  it('treats 1440px and wider as wide', () => {
    expect(isNarrowWidth(1440)).toBe(false)
    expect(isNarrowWidth(1920)).toBe(false)
  })
})
