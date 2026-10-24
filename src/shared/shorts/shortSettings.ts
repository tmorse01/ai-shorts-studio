// Effective settings for one short: the project defaults with the short's overrides applied on top.
// Pure, so the editor and the export code read the same answer.
import type { ShortDefaults, ShortOverrides, TargetLength } from '../project/schema'

export function effectiveShortSettings(
  defaults: ShortDefaults,
  overrides: ShortOverrides
): ShortDefaults {
  return {
    targetLength: { ...(overrides.targetLength ?? defaults.targetLength) },
    platform: overrides.platform ?? defaults.platform,
    safeZones: overrides.safeZones ?? defaults.safeZones
  }
}

// The fields a short can override, in the order the inspector lists them.
export const SHORT_OVERRIDE_FIELDS = ['targetLength', 'platform', 'safeZones'] as const
export type ShortOverrideField = (typeof SHORT_OVERRIDE_FIELDS)[number]

export function overriddenFields(overrides: ShortOverrides): ShortOverrideField[] {
  return SHORT_OVERRIDE_FIELDS.filter((field) => overrides[field] !== undefined)
}

export type TargetTone = 'under' | 'within' | 'over'

export interface TargetReadout {
  tone: TargetTone
  text: string
}

// One decimal place, without a trailing ".0": 42 -> "42", 42.25 -> "42.3".
function seconds(ms: number): string {
  return String(Number((ms / 1000).toFixed(1)))
}

// Compares a short's duration with its target length (both in milliseconds for the duration).
export function targetReadout(durationMs: number, target: TargetLength): TargetReadout {
  const minMs = target.minSec * 1000
  const maxMs = target.maxSec * 1000
  const range = `${target.minSec}–${target.maxSec} s target`
  if (durationMs < minMs) {
    return {
      tone: 'under',
      text: `${seconds(durationMs)} s, ${seconds(minMs - durationMs)} s under the ${range}`
    }
  }
  if (durationMs > maxMs) {
    return {
      tone: 'over',
      text: `${seconds(durationMs)} s, ${seconds(durationMs - maxMs)} s over the ${range}`
    }
  }
  return { tone: 'within', text: `${seconds(durationMs)} s, within the ${range}` }
}
