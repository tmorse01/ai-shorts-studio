import { describe, expect, it } from 'vitest'
import { alignMoments } from '@shared/analysis/suggestions'
import type { Moment } from '@shared/project/schema'
import { CURRENT_SCHEMA_VERSION, type Project } from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { acceptSuggestionsCommand } from '@renderer/features/suggestions/suggestionCommands'
import { openSuggestions } from '@renderer/features/suggestions/suggestionView'
import {
  clipFinderItems,
  clipRowFacts,
  clipStarLabel,
  draftEditFromInput,
  CLIP_FINDER_FILTERS,
  filterClipFinderItems,
  filterClipFinderTab,
  resolutionLabel,
  scoreLabel,
  visibleClipFinderItems,
  type ClipFinderItem,
  type ClipFinderSource,
  type DraftEdit
} from '@renderer/features/clipFinder/clipFinderModel'

const userMoment: Moment = {
  id: 'mom_user',
  mediaId: 'm1',
  name: 'Harbour laugh',
  inMs: 30_000,
  outMs: 42_000,
  tags: ['outdoor'],
  createdBy: 'user',
  note: 'A laugh that lands.'
}

const aiMoment: Moment = {
  id: 'mom_ai',
  mediaId: 'm1',
  name: 'Accepted hook',
  inMs: 5_000,
  outMs: 14_000,
  tags: [],
  createdBy: 'ai'
}

function source(overrides: Partial<ClipFinderSource> = {}): ClipFinderSource {
  return {
    mediaId: 'm1',
    moments: [userMoment, aiMoment],
    drafts: [
      { name: 'Opening line', inMs: 1_000, outMs: 9_000, note: 'Hooks.', score: 82 },
      { name: 'Quiet tear', inMs: 50_000, outMs: 60_000 }
    ],
    tagDrafts: ['sunset'],
    tagNameOf: (id) => (id === 'outdoor' ? 'outdoor' : undefined),
    ...overrides
  }
}

describe('clipFinderItems', () => {
  it('lists tag suggestions first, then moments and drafts in source order', () => {
    const items = clipFinderItems(source())
    expect(items.map((item) => [item.kind, item.name])).toEqual([
      ['tag', 'sunset'],
      ['draft', 'Opening line'],
      ['moment', 'Accepted hook'],
      ['moment', 'Harbour laugh'],
      ['draft', 'Quiet tear']
    ])
  })

  it('names the tags on a saved moment and drops tags it cannot name', () => {
    const items = clipFinderItems(source({ tagNameOf: () => undefined }))
    const saved = items.find((item) => item.kind === 'moment' && item.momentId === 'mom_user')
    expect(saved).toMatchObject({ kind: 'moment', tagNames: [] })
    const named = clipFinderItems(source()).find(
      (item) => item.kind === 'moment' && item.momentId === 'mom_user'
    )
    expect(named).toMatchObject({ kind: 'moment', tagNames: ['outdoor'] })
  })
})

describe('filter', () => {
  const items = clipFinderItems(source())
  const names = (list: ClipFinderItem[]) => list.map((item) => item.name)

  it('All shows everything', () => {
    expect(filterClipFinderItems(items, 'all')).toHaveLength(items.length)
  })

  it('Mine shows only moments the user marked by hand', () => {
    expect(names(filterClipFinderItems(items, 'mine'))).toEqual(['Harbour laugh'])
  })

  it('AI suggested shows open drafts, open tags and AI moments, but not hand-marked ones', () => {
    expect(names(filterClipFinderItems(items, 'ai'))).toEqual([
      'sunset',
      'Opening line',
      'Accepted hook',
      'Quiet tear'
    ])
  })

  it('Starred shows only saved moments the user starred', () => {
    const starred = clipFinderItems(
      source({ moments: [{ ...userMoment, starred: true }, aiMoment] })
    )
    expect(names(filterClipFinderItems(starred, 'starred'))).toEqual(['Harbour laugh'])
    expect(names(filterClipFinderItems(items, 'starred'))).toEqual([])
  })

  it('an unset star reads as not starred', () => {
    expect(
      items.filter((item) => item.kind === 'moment').every((item) => item.starred === false)
    ).toBe(true)
  })

  it('offers Starred after AI suggested', () => {
    expect(CLIP_FINDER_FILTERS.map((option) => option.value)).toEqual([
      'all',
      'mine',
      'ai',
      'starred'
    ])
  })
})

describe('tabs', () => {
  const items = clipFinderItems(source())
  const names = (list: ClipFinderItem[]) => list.map((item) => item.name)

  it('Suggested shows every item', () => {
    expect(filterClipFinderTab(items, 'suggested')).toHaveLength(items.length)
  })

  it('Highlights shows only ranged moments and drafts, not tags', () => {
    expect(names(filterClipFinderTab(items, 'highlights'))).toEqual([
      'Opening line',
      'Accepted hook',
      'Harbour laugh',
      'Quiet tear'
    ])
  })

  it('Topics shows tag suggestions and moments that carry a tag', () => {
    expect(names(filterClipFinderTab(items, 'topics'))).toEqual(['sunset', 'Harbour laugh'])
  })

  it('applies the filter before the tab', () => {
    const shown = visibleClipFinderItems(items, 'mine', 'topics')
    expect(names(shown)).toEqual(['Harbour laugh'])
    expect(visibleClipFinderItems(items, 'ai', 'topics').map((item) => item.name)).toEqual([
      'sunset'
    ])
  })
})

describe('row formatting', () => {
  it('shows the range length, the timecodes and the score out of 100 on a draft', () => {
    const [, draft] = clipFinderItems(source())
    expect(clipRowFacts(draft)).toEqual({
      durationLabel: '0:08',
      rangeLabel: '0:01 to 0:09',
      scoreLabel: '82/100',
      summary: 'Hooks.'
    })
  })

  it('leaves the score out when the suggestion has none', () => {
    const quiet = clipFinderItems(source()).find((item) => item.name === 'Quiet tear')
    expect(quiet && clipRowFacts(quiet).scoreLabel).toBeUndefined()
  })

  it('gives a tag suggestion a fixed summary and no range', () => {
    const [tag] = clipFinderItems(source())
    expect(clipRowFacts(tag)).toEqual({
      durationLabel: undefined,
      rangeLabel: undefined,
      scoreLabel: undefined,
      summary: 'Tag suggestion'
    })
  })

  it('keeps the score between 0 and 100 and rounds it', () => {
    expect(scoreLabel(82.4)).toBe('82/100')
    expect(scoreLabel(140)).toBe('100/100')
    expect(scoreLabel(-5)).toBe('0/100')
  })
})

describe('alignMoments keeps the score', () => {
  it('carries a rounded score onto an aligned moment and omits it when absent', () => {
    const aligned = alignMoments({
      candidates: [
        { name: 'Scored', startSec: 1, endSec: 10, score: 81.6 },
        { name: 'Unscored', startSec: 20, endSec: 30 }
      ],
      shots: [],
      // Sentence edges that already sit on the candidates, so nothing snaps away.
      segments: [
        { startMs: 1000, endMs: 10000 },
        { startMs: 20000, endMs: 30000 }
      ]
    })
    expect(aligned).toEqual([
      { name: 'Scored', inMs: 1000, outMs: 10000, score: 82 },
      { name: 'Unscored', inMs: 20000, outMs: 30000 }
    ])
  })
})

describe('accepting a draft makes a normal moment', () => {
  const project: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    media: [
      {
        id: 'm1',
        path: 'G:\\Footage\\a.mp4',
        pathKind: 'absolute',
        fileName: 'a.mp4',
        sizeBytes: 1,
        kind: 'video',
        durationMs: 60000
      }
    ],
    mediaTags: [],
    moments: [],
    defaults: {
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      safeZones: true
    },
    shorts: [],
    scripts: []
  }
  const draft = { name: 'Opening line', inMs: 1_000, outMs: 9_000, note: 'Hooks.', score: 82 }

  it('turns the draft into an AI moment and takes it off the open list', () => {
    const history = createHistoryStore(project)
    const before = openSuggestions(project, 'm1', { tags: [], moments: [draft] })
    expect(before.moments).toHaveLength(1)

    const accepted = history.getState().execute(
      acceptSuggestionsCommand({
        mediaId: 'm1',
        tags: [],
        moments: [draft],
        newId: () => 'mom_new'
      })
    )
    expect(accepted).toBe(true)

    const after = history.getState().present
    expect(after.moments).toEqual([
      {
        id: 'mom_new',
        mediaId: 'm1',
        name: 'Opening line',
        inMs: 1_000,
        outMs: 9_000,
        tags: [],
        createdBy: 'ai',
        score: 82,
        note: 'Hooks.'
      }
    ])
    expect(openSuggestions(after, 'm1', { tags: [], moments: [draft] }).moments).toEqual([])
  })
})

describe('draft edits and saved scores', () => {
  const draftSource = (edits?: Map<string, DraftEdit>): ClipFinderSource => ({
    mediaId: 'm1',
    moments: [],
    drafts: [{ name: 'Old name', inMs: 1000, outMs: 5000, score: 70 }],
    draftEdits: edits,
    tagDrafts: [],
    tagNameOf: () => undefined
  })

  it('keeps the draft key when its range is edited, so dismissing still finds it', () => {
    const original = clipFinderItems(draftSource())[0]
    const edited = clipFinderItems(
      draftSource(new Map([[original.key, { name: 'New name', inMs: 2000, outMs: 9000 }]]))
    )[0]
    expect(edited.key).toBe(original.key)
    expect(edited).toMatchObject({
      kind: 'draft',
      name: 'New name',
      inMs: 2000,
      outMs: 9000,
      score: 70
    })
  })

  it('reads a draft edit from the editor text in seconds', () => {
    expect(draftEditFromInput({ name: ' Hook ', inSec: '12.5', outSec: '41', note: ' ' })).toEqual({
      ok: true,
      edit: { name: 'Hook', inMs: 12500, outMs: 41000 }
    })
  })

  it('refuses an empty name, bad times and an Out before In', () => {
    expect(draftEditFromInput({ name: ' ', inSec: '1', outSec: '2', note: '' })).toMatchObject({
      ok: false
    })
    expect(draftEditFromInput({ name: 'a', inSec: 'soon', outSec: '2', note: '' })).toMatchObject({
      ok: false
    })
    expect(draftEditFromInput({ name: 'a', inSec: '-1', outSec: '2', note: '' })).toMatchObject({
      ok: false
    })
    expect(draftEditFromInput({ name: 'a', inSec: '5', outSec: '5', note: '' })).toEqual({
      ok: false,
      error: 'Out must come after In.'
    })
  })

  it('shows the score on an accepted moment', () => {
    const accepted: Moment = {
      id: 'mom_ai',
      mediaId: 'm1',
      name: 'Saved',
      inMs: 0,
      outMs: 4000,
      tags: [],
      createdBy: 'ai',
      score: 84
    }
    const item = clipFinderItems({ ...draftSource(), moments: [accepted], drafts: [] })[0]
    expect(clipRowFacts(item).scoreLabel).toBe('84/100')
  })

  it('labels a video by its shorter side', () => {
    expect(resolutionLabel({ width: 1920, height: 1080 })).toBe('1080p')
    expect(resolutionLabel({ width: 1080, height: 1920 })).toBe('1080p')
  })
})

describe('clip star label', () => {
  it('names the action the click takes', () => {
    expect(clipStarLabel(false)).toBe('Star clip')
    expect(clipStarLabel(true)).toBe('Unstar clip')
  })
})
