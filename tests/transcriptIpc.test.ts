import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Transcript } from '@shared/analysis/transcript'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { analysisFramesDir } from '../src/main/analysis/frameCache'
import {
  transcriptCachePath,
  writeTranscriptCache
} from '../src/main/transcription/transcriptStage'
import { emptyAnalysisFile } from '@shared/analysis/analysis'

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'transcript-ipc-'))
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    analysisStorage: {
      load: async () => emptyAnalysisFile(),
      save: async () => undefined
    }
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { folder, api }
}

describe('analysis:transcript:read round trip', () => {
  it('returns the cached transcript of a media item', async () => {
    const { folder, api } = setup()
    const transcript: Transcript = {
      version: 1,
      words: [{ text: 'Hi', startMs: 100, endMs: 400 }],
      segments: [{ text: 'Hi', startMs: 100, endMs: 400 }]
    }
    const file = transcriptCachePath(analysisFramesDir(folder, 'clip-1'))
    await writeTranscriptCache(file, transcript)

    const result = await api.invoke('analysis:transcript:read', {
      projectFolder: folder,
      mediaId: 'clip-1'
    })

    expect(result).toEqual({ ok: true, data: { transcript } })
  })

  it('returns null when the item has no transcript yet', async () => {
    const { folder, api } = setup()

    const result = await api.invoke('analysis:transcript:read', {
      projectFolder: folder,
      mediaId: 'clip-2'
    })

    expect(result).toEqual({ ok: true, data: { transcript: null } })
  })

  it('rejects a media id that could escape the cache folder', async () => {
    const { folder, api } = setup()

    const result = await api.invoke('analysis:transcript:read', {
      projectFolder: folder,
      mediaId: '../secrets'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
