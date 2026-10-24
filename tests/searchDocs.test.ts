import { describe, expect, it } from 'vitest'
import { newAnalysisRecord, withStageStatus, withShots } from '@shared/analysis/analysis'
import type { MediaRef, Moment } from '@shared/project/schema'
import { analysisSignature, buildMediaSearchDocs } from '../src/renderer/features/search/searchDocs'

const ref: MediaRef = {
  id: 'clip-1',
  path: 'media/clip-1.mp4',
  pathKind: 'relative',
  fileName: 'clip-1.mp4',
  sizeBytes: 100,
  durationMs: 9000,
  kind: 'video',
  tagIds: ['tag-b-roll']
}

const moment: Moment = {
  id: 'm1',
  mediaId: 'clip-1',
  name: 'Crowd reaction',
  inMs: 3000,
  outMs: 5500,
  tags: ['tag-custom'],
  createdBy: 'user'
}

describe('buildMediaSearchDocs', () => {
  it('turns speech, shots, tags and moments into documents with their source ranges', () => {
    const docs = buildMediaSearchDocs({
      ref,
      transcript: {
        version: 1,
        words: [],
        segments: [{ text: 'Welcome back everyone', startMs: 100, endMs: 1900 }]
      },
      shots: [
        { startSec: 0, endSec: 2.5 },
        { startSec: 2.5, endSec: 6 }
      ],
      vision: [{ shotIndex: 1, description: 'A crowd cheers', tags: ['outdoor'] }],
      tagNames: new Map([
        ['tag-b-roll', 'B-roll'],
        ['tag-custom', 'Funny']
      ]),
      moments: [moment]
    })

    expect(docs.map((doc) => [doc.kind, doc.text, doc.startMs, doc.endMs])).toEqual([
      ['segment', 'Welcome back everyone', 100, 1900],
      ['shot', 'A crowd cheers outdoor', 2500, 6000],
      ['tag', 'B-roll', 0, 9000],
      ['moment', 'Crowd reaction Funny', 3000, 5500]
    ])
    expect(new Set(docs.map((doc) => doc.id)).size).toBe(docs.length)
    expect(docs.every((doc) => doc.mediaId === 'clip-1')).toBe(true)
  })

  it('skips a shot description that has no shot range to point at', () => {
    const docs = buildMediaSearchDocs({
      ref: { ...ref, tagIds: undefined },
      transcript: null,
      shots: [],
      vision: [{ shotIndex: 4, description: 'Lost shot', tags: [] }],
      tagNames: new Map(),
      moments: []
    })
    expect(docs).toEqual([])
  })

  it('ignores moments of other media and blank text', () => {
    const docs = buildMediaSearchDocs({
      ref: { ...ref, tagIds: undefined },
      transcript: { version: 1, words: [], segments: [{ text: '  ', startMs: 0, endMs: 10 }] },
      shots: [],
      vision: [],
      tagNames: new Map(),
      moments: [{ ...moment, mediaId: 'clip-9', name: 'Elsewhere' }]
    })
    expect(docs).toEqual([])
  })
})

describe('analysisSignature', () => {
  it('is empty before a record exists', () => {
    expect(analysisSignature(undefined)).toBe('')
  })

  it('changes when a stage finishes or the shots change', () => {
    const pending = newAnalysisRecord('clip-1')
    const transcribed = withStageStatus(pending, 'transcript', 'done')
    const shotted = withShots(transcribed, [{ startSec: 0, endSec: 3 }])
    expect(analysisSignature(transcribed)).not.toBe(analysisSignature(pending))
    expect(analysisSignature(shotted)).not.toBe(analysisSignature(transcribed))
  })
})
