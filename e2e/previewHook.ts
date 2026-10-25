// Reads the preview's E2E test hook (window.__aissE2E) so specs can compare the source frame the
// preview shows. The hook is set only in AISS_E2E runs.
import type { Page } from '@playwright/test'
import type { E2eHook } from '../src/shared/e2e/previewHook'
import { formatTimecode } from '../src/renderer/features/playback/playbackClock'

export interface CurrentSourceTimecode {
  /** The source time of the frame the preview shows, in ms. Null when no video layer is at the playhead. */
  ms: number | null
  /** The same time as MM:SS:FF, or null with ms. */
  timecode: string | null
  /** The media the frame draws from, or null. */
  mediaId: string | null
}

/** The source time, media id and timecode of the frame the preview is showing now. */
export async function currentSourceTimecode(page: Page): Promise<CurrentSourceTimecode> {
  const hook = await page.evaluate(
    () => (window as unknown as { __aissE2E?: E2eHook }).__aissE2E ?? null
  )
  const frame = hook?.preview
  const ms = frame?.sourceTimeMs ?? null
  return {
    ms,
    timecode: ms === null ? null : formatTimecode(ms),
    mediaId: frame?.mediaId ?? null
  }
}
