import { describe, expect, it } from 'vitest'
import {
  newAnalysisRecord,
  withShots,
  withStageStatus,
  type AnalysisFile
} from '@shared/analysis/analysis'
import type { RendererInvokeApi } from '@shared/ipc'
import type { MediaRef, Project } from '@shared/project/schema'
import { searchIndex } from '../src/renderer/features/search/searchIndexStore'
import { syncSearchIndex } from '../src/renderer/features/search/searchSync'

const ref: MediaRef = {
  id: 'clip-1',
  path: 'media/clip-1.mp4',
  pathKind: 'relative',
  fileName: 'clip-1.mp4',
  sizeBytes: 100,
  durationMs: 9000,
  kind: 'video'
}

const project = { media: [ref], moments: [], mediaTags: [] } as unknown as Project

// A fake api that records every read and answers with one transcript and one shot description.
function fakeApi() {
  const reads: string[] = []
  const api = {
    invoke: async (channel: string) => {
      reads.push(channel)
      if (channel === 'analysis:transcript:read') {
        return {
          ok: true,
          data: {
            transcript: {
              version: 1,
              words: [],
              segments: [{ text: 'hello from the harbour', startMs: 0, endMs: 1500 }]
            }
          }
        }
      }
      return {
        ok: true,
        data: { shots: [{ shotIndex: 0, description: 'a lighthouse at dusk', tags: ['night'] }] }
      }
    }
  }
  return { reads, api: api as unknown as RendererInvokeApi }
}

function fileWith(stages: { transcript: boolean; vision: boolean }): AnalysisFile {
  let record = withShots(newAnalysisRecord('clip-1'), [{ startSec: 0, endSec: 4 }])
  if (stages.transcript) record = withStageStatus(record, 'transcript', 'done')
  if (stages.vision) record = withStageStatus(record, 'vision', 'done')
  return { autoAnalyze: true, records: { 'clip-1': record } }
}

describe('syncSearchIndex', () => {
  it('indexes finished stages and reads them only once', async () => {
    const folder = 'sync-test-once'
    const { api, reads } = fakeApi()
    const file = fileWith({ transcript: true, vision: false })

    await syncSearchIndex(api, folder, project, file)
    expect(searchIndex.search('harbour').map((hit) => hit.kind)).toEqual(['segment'])
    expect(reads).toEqual(['analysis:transcript:read'])

    await syncSearchIndex(api, folder, project, file)
    expect(reads).toHaveLength(1)
  })

  it('picks up a stage that finishes later without losing the earlier one', async () => {
    const folder = 'sync-test-later'
    const { api, reads } = fakeApi()

    await syncSearchIndex(api, folder, project, fileWith({ transcript: true, vision: false }))
    await syncSearchIndex(api, folder, project, fileWith({ transcript: true, vision: true }))

    expect(reads).toContain('analysis:vision:read')
    expect(searchIndex.search('lighthouse').map((hit) => hit.kind)).toEqual(['shot'])
    expect(searchIndex.search('harbour').map((hit) => hit.kind)).toEqual(['segment'])
  })

  it('drops the documents of a media item that left the project', async () => {
    const folder = 'sync-test-removed'
    const { api } = fakeApi()
    await syncSearchIndex(api, folder, project, fileWith({ transcript: true, vision: false }))

    await syncSearchIndex(api, folder, { ...project, media: [] } as Project, undefined)
    expect(searchIndex.search('harbour')).toEqual([])
  })
})
