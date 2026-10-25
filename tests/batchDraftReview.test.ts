import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  type Script,
  type Short
} from '@shared/project/schema'
import type { AssemblyPlan } from '@shared/assembly/assemblyPlan'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { applyFootagePlanCommand } from '@renderer/features/assembly/assemblyCommands'
import { acceptedPlan } from '@renderer/features/assembly/assemblyReview'
import { keepBatchDraftCommand } from '@renderer/features/shorts/batchDraftCommands'
import { deleteShortCommand } from '@renderer/features/shorts/shortCommands'
import { canRegenerateBatchDraft, filterBatchDrafts } from '@renderer/features/shorts/shortsView'

const NOW = '2026-10-25T09:00:00.000Z'

const script: Script = {
  id: 's1',
  title: 'Harbour hook',
  topic: '',
  lines: [
    { id: 'l1', text: 'Opening line' },
    { id: 'l2', text: 'Second line' }
  ]
}

const plan: AssemblyPlan = {
  lines: [
    {
      lineId: 'l1',
      cuts: [{ sourceId: 'm1', inMs: 0, outMs: 2000, role: 'a', alternatives: [] }]
    },
    {
      lineId: 'l2',
      cuts: [{ sourceId: 'm2', inMs: 1000, outMs: 4000, role: 'a', alternatives: [] }]
    }
  ]
}

function projectWith(shorts: Short[] = []): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour',
    createdAt: NOW,
    updatedAt: NOW,
    media: [],
    mediaTags: [],
    moments: [],
    defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
    shorts,
    scripts: [script]
  }
}

function shortWith(patch: Partial<Short>): Short {
  return {
    id: 'short_1',
    name: 'Short 1',
    createdAt: NOW,
    updatedAt: NOW,
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: { tracks: [] },
    ...patch
  }
}

function applyFromScript(batchDraft: boolean | undefined) {
  return applyFootagePlanCommand({
    shortId: 'short_1',
    trackId: 'track_1',
    plan: acceptedPlan(plan, new Set(['l1', 'l2'])),
    now: NOW,
    newId: (() => {
      let n = 0
      return () => `clip_${++n}`
    })(),
    createFromScript: { scriptId: 's1', ...(batchDraft === undefined ? {} : { batchDraft }) }
  })
}

describe('applying a reviewed plan that creates a short', () => {
  it('creates a batch draft with the footage on its main track when the plan came from a batch', () => {
    const history = createHistoryStore(projectWith())
    history.getState().execute(applyFromScript(true))
    const [short] = history.getState().present.shorts
    expect(short.batchDraft).toBe(true)
    expect(short.scriptId).toBe('s1')
    const clips = short.timeline.tracks[0].clips
    expect(clips.map((clip) => clip.mediaId)).toEqual(['m1', 'm2'])
  })

  it('creates an ordinary short when the plan was matched in the review panel', () => {
    const history = createHistoryStore(projectWith())
    history.getState().execute(applyFromScript(false))
    const [short] = history.getState().present.shorts
    expect(short.batchDraft).toBeUndefined()
    expect(short.timeline.tracks[0].clips).toHaveLength(2)
  })

  it('removes the draft short and its footage in one undo step', () => {
    const history = createHistoryStore(projectWith())
    history.getState().execute(applyFromScript(true))
    history.getState().undo()
    expect(history.getState().present.shorts).toHaveLength(0)
  })
})

describe('keeping a batch draft', () => {
  it('clears the badge and leaves the footage in place', () => {
    const history = createHistoryStore(projectWith([shortWith({ batchDraft: true })]))
    history.getState().execute(keepBatchDraftCommand('short_1', NOW))
    expect(history.getState().present.shorts[0].batchDraft).toBeUndefined()
    history.getState().undo()
    expect(history.getState().present.shorts[0].batchDraft).toBe(true)
  })

  it('refuses a short that is not a batch draft, without a history step', () => {
    const history = createHistoryStore(projectWith([shortWith({})]))
    const before = history.getState().present
    expect(() => history.getState().execute(keepBatchDraftCommand('short_1', NOW))).toThrow(
      'not a batch draft'
    )
    expect(history.getState().present).toBe(before)
  })
})

describe('discarding a batch draft', () => {
  it('deletes the short and restores it on undo', () => {
    const history = createHistoryStore(projectWith([shortWith({ batchDraft: true })]))
    history.getState().execute(deleteShortCommand('short_1'))
    expect(history.getState().present.shorts).toHaveLength(0)
    history.getState().undo()
    expect(history.getState().present.shorts[0]).toMatchObject({ id: 'short_1', batchDraft: true })
  })
})

describe('batch draft filter and regenerate', () => {
  const shorts = [
    shortWith({ id: 'a', order: 0 }),
    shortWith({ id: 'b', order: 1, batchDraft: true, scriptId: 's1' }),
    shortWith({ id: 'c', order: 2, batchDraft: true })
  ]

  it('keeps every short unless the review filter is on', () => {
    expect(filterBatchDrafts(shorts, false).map((short) => short.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps only batch drafts when the review filter is on', () => {
    expect(filterBatchDrafts(shorts, true).map((short) => short.id)).toEqual(['b', 'c'])
  })

  it('offers regenerate only for a batch draft whose script still exists', () => {
    expect(canRegenerateBatchDraft(shorts[1], [script])).toBe(true)
    expect(canRegenerateBatchDraft(shorts[2], [script])).toBe(false)
    expect(canRegenerateBatchDraft(shorts[0], [script])).toBe(false)
    expect(canRegenerateBatchDraft(shorts[1], [])).toBe(false)
  })
})
