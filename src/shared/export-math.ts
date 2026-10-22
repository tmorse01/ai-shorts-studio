import type { ExportOptions } from './schemas'

/** Defaults match the encode settings the app shipped with, so existing exports look the same. */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  quality: 'standard',
  resolution: '1080p',
  fps: 'source',
  audioKbps: 160
}

/** libx264 CRF per quality preset. Lower is larger and sharper; 20 is the original fixed value. */
export const CRF_BY_QUALITY: Record<ExportOptions['quality'], number> = {
  high: 18,
  standard: 20,
  small: 24
}

export function qualityToCrf(quality: ExportOptions['quality']): number {
  return CRF_BY_QUALITY[quality]
}

/** Shorter edge of the output frame in pixels. */
export function shortSideFor(resolution: ExportOptions['resolution']): number {
  return resolution === '720p' ? 720 : 1080
}

/**
 * Seconds left, extrapolated from how long the work has taken so far. Null until there is enough
 * progress to say anything useful.
 */
export function estimateRemainingSec(elapsedSec: number, fraction: number): number | null {
  if (fraction >= 1) return 0
  if (fraction <= 0 || elapsedSec <= 0) return null
  return (elapsedSec * (1 - fraction)) / fraction
}
