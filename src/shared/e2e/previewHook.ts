// The E2E test hook for the preview. With AISS_E2E=1 the main process passes E2E_RENDERER_ARG to
// the window, the preload reports it as window.api.e2eMode, and the preview publishes the frame it
// draws on window.__aissE2E. With the flag unset nothing is published. Pure, so it is unit tested
// without a DOM.

/** The extra argument the main process adds to the window in E2E mode, read by the preload. */
export const E2E_RENDERER_ARG = '--aiss-e2e'

/** The frame the preview shows: the topmost video layer at the playhead, or nothing. */
export interface E2ePreviewFrame {
  mediaId: string | null
  sourceTimeMs: number | null
}

export interface E2eHook {
  preview: E2ePreviewFrame
  /** The text and caption lines the preview draws at the playhead, top layer last. */
  texts?: string[]
  /** The peak level of the preview's audio graph (0 to 1) at the last audio update. */
  audioLevel?: number
}

/** The window fields the hook writes. Only present once a frame has been published. */
export interface E2eHookHost {
  __aissE2E?: E2eHook
}

/** The frame for a resolved layer, or an empty frame when no video layer is at the playhead. */
export function previewFrameOf(
  layer: { mediaId?: string; sourceTimeMs: number } | null | undefined
): E2ePreviewFrame {
  if (!layer) return { mediaId: null, sourceTimeMs: null }
  return { mediaId: layer.mediaId ?? null, sourceTimeMs: layer.sourceTimeMs }
}

/** Publishes the frame on the host when the hook is enabled. Does nothing otherwise. */
export function publishPreviewFrame(
  host: E2eHookHost,
  enabled: boolean,
  frame: E2ePreviewFrame
): void {
  if (!enabled) return
  host.__aissE2E = { ...host.__aissE2E, preview: { ...frame } }
}

/** Publishes the text and caption lines the preview draws. Does nothing when the hook is off. */
export function publishPreviewTexts(host: E2eHookHost, enabled: boolean, texts: string[]): void {
  if (!enabled) return
  host.__aissE2E = { ...host.__aissE2E, preview: host.__aissE2E?.preview ?? emptyFrame(), texts }
}

/** Publishes the audio graph's peak level. Does nothing when the hook is off. */
export function publishAudioLevel(host: E2eHookHost, enabled: boolean, level: number): void {
  if (!enabled) return
  host.__aissE2E = {
    ...host.__aissE2E,
    preview: host.__aissE2E?.preview ?? emptyFrame(),
    audioLevel: level
  }
}

/** The text lines of a frame's text and caption layers, in draw order. Pure, for the preview to publish. */
export function textLinesOf(
  layers: readonly {
    text?: { lines: readonly string[] }
    captions?: { lines: readonly (readonly { text: string }[])[] }
  }[]
): string[] {
  const lines: string[] = []
  for (const layer of layers) {
    if (layer.text) lines.push(...layer.text.lines)
    if (layer.captions) {
      for (const words of layer.captions.lines) {
        lines.push(words.map((word) => word.text).join(' '))
      }
    }
  }
  return lines
}

function emptyFrame(): E2ePreviewFrame {
  return { mediaId: null, sourceTimeMs: null }
}
