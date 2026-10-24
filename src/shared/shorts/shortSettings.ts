// Effective settings for one short: the project defaults with the short's overrides applied on top.
// Pure, so the editor and the export code read the same answer.
import type { ShortDefaults, ShortOverrides } from '../project/schema'

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
