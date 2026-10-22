import { describe, expect, it } from 'vitest'
import {
  CRF_BY_QUALITY,
  DEFAULT_EXPORT_OPTIONS,
  estimateRemainingSec,
  qualityToCrf,
  shortSideFor
} from '../src/shared/export-math'
import { exportRequestSchema, exportOptionsSchema } from '../src/shared/schemas'
import { outputSize } from '../src/shared/timeline'

describe('export presets', () => {
  it('keeps the standard preset at the CRF the app always shipped with', () => {
    expect(qualityToCrf('standard')).toBe(20)
    expect(DEFAULT_EXPORT_OPTIONS).toEqual({ quality: 'standard', resolution: '1080p', fps: 'source', audioKbps: 160 })
  })

  it('orders quality presets so higher quality means lower CRF', () => {
    expect(CRF_BY_QUALITY.high).toBeLessThan(CRF_BY_QUALITY.standard)
    expect(CRF_BY_QUALITY.standard).toBeLessThan(CRF_BY_QUALITY.small)
  })

  it('maps resolution to the short side of the frame', () => {
    expect(shortSideFor('1080p')).toBe(1080)
    expect(shortSideFor('720p')).toBe(720)
  })
})

describe('estimateRemainingSec', () => {
  it('extrapolates the rest of the work from the time spent so far', () => {
    // 30s elapsed at 25% done means about 90s left.
    expect(estimateRemainingSec(30, 0.25)).toBeCloseTo(90, 5)
  })

  it('returns null before there is any progress to extrapolate from', () => {
    expect(estimateRemainingSec(0, 0.5)).toBeNull()
    expect(estimateRemainingSec(12, 0)).toBeNull()
  })

  it('returns zero once the work is complete', () => {
    expect(estimateRemainingSec(40, 1)).toBe(0)
  })
})

describe('exportOptionsSchema', () => {
  it('fills every option with its default when the renderer sends none', () => {
    expect(exportOptionsSchema.parse({})).toEqual(DEFAULT_EXPORT_OPTIONS)
  })

  it('rejects values outside the offered choices', () => {
    expect(exportOptionsSchema.safeParse({ resolution: '4k' }).success).toBe(false)
    expect(exportOptionsSchema.safeParse({ fps: 24 }).success).toBe(false)
    expect(exportOptionsSchema.safeParse({ audioKbps: 320 }).success).toBe(false)
  })

  it('lets an export request omit options and still be valid (older callers)', () => {
    const parsed = exportRequestSchema.parse({
      projectId: 'proj-1',
      shortIds: ['short-1'],
      outputDir: 'C:\\Videos'
    })
    expect(parsed.options).toEqual(DEFAULT_EXPORT_OPTIONS)
    expect(parsed.overwrite).toBe(false)
  })
})

describe('outputSize with a shorter side', () => {
  it('keeps 1080p output unchanged for every ratio', () => {
    expect(outputSize('9:16', { width: 1920, height: 1080 }, 1080)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('16:9', { width: 1920, height: 1080 }, 1080)).toEqual({ width: 1920, height: 1080 })
  })

  it('scales vertical and landscape frames so the shorter edge is 720', () => {
    expect(outputSize('9:16', { width: 1920, height: 1080 }, 720)).toEqual({ width: 720, height: 1280 })
    expect(outputSize('16:9', { width: 1920, height: 1080 }, 720)).toEqual({ width: 1280, height: 720 })
    expect(outputSize('1:1', { width: 1920, height: 1080 }, 720)).toEqual({ width: 720, height: 720 })
  })

  it('ignores the short side for original ratio, which keeps the source size', () => {
    expect(outputSize('original', { width: 1921, height: 1081 }, 720)).toEqual({ width: 1920, height: 1080 })
  })
})
