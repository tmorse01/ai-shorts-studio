import { describe, expect, it } from 'vitest'
import {
  E2E_RENDERER_ARG,
  previewFrameOf,
  publishAudioLevel,
  publishPreviewFrame,
  publishPreviewTexts,
  textLinesOf,
  type E2eHookHost
} from '../src/shared/e2e/previewHook'

describe('E2E preview hook', () => {
  it('publishes nothing when the flag is off', () => {
    const host: E2eHookHost = {}
    publishPreviewFrame(host, false, { mediaId: 'm1', sourceTimeMs: 1500 })
    expect('__aissE2E' in host).toBe(false)
  })

  it('publishes the current frame when the flag is on, and updates it on each render', () => {
    const host: E2eHookHost = {}
    publishPreviewFrame(host, true, { mediaId: 'm1', sourceTimeMs: 1500 })
    expect(host.__aissE2E?.preview).toEqual({ mediaId: 'm1', sourceTimeMs: 1500 })
    publishPreviewFrame(host, true, { mediaId: 'm2', sourceTimeMs: 0 })
    expect(host.__aissE2E?.preview).toEqual({ mediaId: 'm2', sourceTimeMs: 0 })
  })

  it('maps a resolved layer to its frame, and no layer to an empty frame', () => {
    expect(previewFrameOf({ mediaId: 'm1', sourceTimeMs: 4200 })).toEqual({
      mediaId: 'm1',
      sourceTimeMs: 4200
    })
    expect(previewFrameOf(null)).toEqual({ mediaId: null, sourceTimeMs: null })
  })

  it('keeps the frame when texts or the audio level are published after it', () => {
    const host: E2eHookHost = {}
    publishPreviewFrame(host, true, { mediaId: 'm1', sourceTimeMs: 10 })
    publishPreviewTexts(host, true, ['Hello'])
    publishAudioLevel(host, true, 0.5)
    expect(host.__aissE2E).toEqual({
      preview: { mediaId: 'm1', sourceTimeMs: 10 },
      texts: ['Hello'],
      audioLevel: 0.5
    })
  })

  it('publishes texts and audio level only when the flag is on', () => {
    const host: E2eHookHost = {}
    publishPreviewTexts(host, false, ['Hello'])
    publishAudioLevel(host, false, 1)
    expect('__aissE2E' in host).toBe(false)
    publishAudioLevel(host, true, 0)
    expect(host.__aissE2E?.audioLevel).toBe(0)
    expect(host.__aissE2E?.preview).toEqual({ mediaId: null, sourceTimeMs: null })
  })

  it('lists the text and caption lines of a frame, in draw order', () => {
    const lines = textLinesOf([
      { text: { lines: ['TITLE'] } },
      {},
      {
        captions: {
          lines: [[{ text: 'Hello' }, { text: 'there' }]]
        }
      }
    ])
    expect(lines).toEqual(['TITLE', 'Hello there'])
  })

  it('uses a flag argument that the main process and preload share', () => {
    expect(E2E_RENDERER_ARG).toBe('--aiss-e2e')
  })
})
