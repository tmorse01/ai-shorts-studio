import { describe, expect, it } from 'vitest'
import {
  alignMoments,
  buildMomentPrompt,
  deriveTagSuggestions,
  MOMENT_MAX_MS,
  momentSuggestionKey,
  notDismissed,
  parseMomentReply,
  SUGGESTION_MOMENT_LIMIT,
  SUGGESTION_TAG_LIMIT,
  tagSuggestionKey
} from '@shared/analysis/suggestions'
import { CURRENT_SCHEMA_VERSION, type Moment, type Project } from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { acceptSuggestionsCommand } from '@renderer/features/suggestions/suggestionCommands'
import { openSuggestions } from '@renderer/features/suggestions/suggestionView'

describe('tag suggestions', () => {
  it('suggests A-roll when the clip has speech and B-roll when it does not', () => {
    expect(deriveTagSuggestions({ speech: true, shotTags: [] })).toEqual(['A-roll'])
    expect(deriveTagSuggestions({ speech: false, shotTags: [] })).toEqual(['B-roll'])
  })

  it('suggests no speech tag before the transcript stage has run', () => {
    expect(deriveTagSuggestions({ speech: undefined, shotTags: [['outdoor']] })).toEqual([
      'outdoor'
    ])
  })

  it('adds the most frequent vision tags, up to the limit, after the speech tag', () => {
    const shotTags = [
      ['Crowd', 'outdoor'],
      ['outdoor', 'close-up'],
      ['outdoor', 'crowd', 'sunset'],
      ['sunset', 'indoor']
    ]
    const names = deriveTagSuggestions({ speech: true, shotTags })
    expect(names[0]).toBe('A-roll')
    expect(names.slice(1)).toEqual(['outdoor', 'crowd', 'sunset'])
    expect(names.length).toBe(1 + SUGGESTION_TAG_LIMIT)
  })

  it('ignores empty tags and never repeats the speech tag as a vision tag', () => {
    const names = deriveTagSuggestions({ speech: false, shotTags: [['', ' ', 'B-roll', 'street']] })
    expect(names).toEqual(['B-roll', 'street'])
  })
})

describe('moment alignment', () => {
  const shots = [
    { startSec: 0, endSec: 10 },
    { startSec: 10, endSec: 25 }
  ]
  const segments = [
    { startMs: 500, endMs: 9800 },
    { startMs: 10200, endMs: 24600 }
  ]

  it('snaps each edge onto a nearby shot or sentence boundary', () => {
    const [moment] = alignMoments({
      candidates: [{ name: 'Hook', startSec: 0.4, endSec: 24.1, note: 'Opens strong.' }],
      shots,
      segments,
      durationMs: 25000
    })
    // 0.4s is nearest the sentence start at 0.5s; 24.1s is nearest the sentence end at 24.6s.
    expect(moment).toEqual({ name: 'Hook', inMs: 500, outMs: 24600, note: 'Opens strong.' })
  })

  it('leaves an edge alone when no boundary is close enough', () => {
    const [moment] = alignMoments({
      candidates: [{ name: 'Middle', startSec: 4.5, endSec: 7.5 }],
      shots,
      segments: [],
      durationMs: 25000
    })
    expect(moment).toEqual({ name: 'Middle', inMs: 4500, outMs: 7500 })
  })

  it('drops candidates that are too short or too long', () => {
    const result = alignMoments({
      candidates: [
        { name: 'Blink', startSec: 4, endSec: 4.5 },
        { name: 'Epic', startSec: 0, endSec: MOMENT_MAX_MS / 1000 + 10 }
      ],
      shots,
      segments: [],
      durationMs: 300000
    })
    expect(result).toEqual([])
  })

  it('keeps candidates inside the clip length and drops repeated ranges', () => {
    const result = alignMoments({
      candidates: [
        { name: 'Tail', startSec: 20, endSec: 60 },
        { name: 'Tail again', startSec: 20, endSec: 60 }
      ],
      shots,
      segments: [],
      durationMs: 25000
    })
    expect(result).toEqual([{ name: 'Tail', inMs: 20000, outMs: 25000 }])
  })

  it('caps the number of moments kept', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      name: `Moment ${index}`,
      startSec: index * 10,
      endSec: index * 10 + 8
    }))
    const result = alignMoments({ candidates, shots: [], segments: [], durationMs: 500000 })
    expect(result).toHaveLength(SUGGESTION_MOMENT_LIMIT)
  })
})

describe('moment prompt and reply', () => {
  it('reads a reply wrapped in a code fence and drops entries that do not fit', () => {
    const reply = [
      'Here you go:',
      '```json',
      '[{"name": "Opening line", "startSec": 1.5, "endSec": 20, "note": "Hooks."},',
      ' {"name": "", "startSec": 3, "endSec": 9},',
      ' {"startSec": 3}]',
      '```'
    ].join('\n')
    expect(parseMomentReply(reply)).toEqual([
      { name: 'Opening line', startSec: 1.5, endSec: 20, note: 'Hooks.' }
    ])
  })

  it('returns undefined when the reply has no JSON array', () => {
    expect(parseMomentReply('I could not find any moments.')).toBeUndefined()
  })

  it('builds a prompt from the transcript timings and shot descriptions', () => {
    const prompt = buildMomentPrompt({
      fileName: 'harbour.mp4',
      segments: [{ startMs: 1200, text: 'The boats leave at dawn.' }],
      shots: [{ shotIndex: 0, startSec: 0, endSec: 4.2, description: 'Boats at a pier' }]
    })
    expect(prompt).toContain('[1.2s] The boats leave at dawn.')
    expect(prompt).toContain('Shot 0 (0.0s to 4.2s): Boats at a pier')
    expect(prompt).toContain('Clip: harbour.mp4')
  })
})

describe('dismissal', () => {
  it('keys tags by name and moments by range', () => {
    expect(tagSuggestionKey('A-roll')).toBe(tagSuggestionKey(' a-  ROLL '))
    expect(momentSuggestionKey({ inMs: 1000, outMs: 9000 })).toBe('moment:1000-9000')
  })

  it('removes dismissed suggestions and keeps the rest', () => {
    const moments = [
      { name: 'A', inMs: 0, outMs: 5000 },
      { name: 'B', inMs: 6000, outMs: 9000 }
    ]
    const kept = notDismissed(moments, [momentSuggestionKey(moments[0])], momentSuggestionKey)
    expect(kept.map((moment) => moment.name)).toEqual(['B'])
  })
})

function projectWith(moments: Moment[] = []): Project {
  return {
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
        durationMs: 60000,
        tagIds: ['a-roll']
      }
    ],
    mediaTags: [{ id: 'outdoor', name: 'outdoor' }],
    moments,
    defaults: {
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      safeZones: true
    },
    shorts: [],
    scripts: []
  }
}

describe('accepting suggestions', () => {
  const suggestedMoments = [
    { name: 'Hook', inMs: 1000, outMs: 9000, note: 'Opens strong.' },
    { name: 'Payoff', inMs: 20000, outMs: 32000 }
  ]
  let nextId = 0
  const newId = () => `new_${++nextId}`

  it('shows only tags and moments that are not accepted yet', () => {
    const project = projectWith()
    const open = openSuggestions(project, 'm1', {
      tags: ['A-roll', 'outdoor', 'sunset'],
      moments: suggestedMoments
    })
    expect(open.tags).toEqual(['outdoor', 'sunset'])
    expect(open.moments).toHaveLength(2)
  })

  it('accepts several tags and moments as one undoable step', () => {
    const history = createHistoryStore(projectWith())
    const command = acceptSuggestionsCommand({
      mediaId: 'm1',
      tags: ['outdoor', 'sunset'],
      moments: suggestedMoments,
      newId
    })
    expect(history.getState().execute(command)).toBe(true)

    const after = history.getState().present
    // The existing 'outdoor' tag is reused; 'sunset' is created with a new id.
    const sunset = after.mediaTags.find((tag) => tag.name === 'sunset')
    expect(sunset).toBeDefined()
    expect(after.media[0].tagIds).toEqual(['a-roll', 'outdoor', sunset?.id])
    expect(after.mediaTags.map((tag) => tag.name)).toEqual(['outdoor', 'sunset'])
    expect(after.moments.map((moment) => [moment.name, moment.createdBy])).toEqual([
      ['Hook', 'ai'],
      ['Payoff', 'ai']
    ])
    expect(after.moments[0].note).toBe('Opens strong.')
    expect(history.getState().past).toHaveLength(1)

    expect(history.getState().undo()).toBe(true)
    expect(history.getState().present).toEqual(projectWith())
    expect(history.getState().past).toHaveLength(0)

    expect(history.getState().redo()).toBe(true)
    expect(history.getState().present).toEqual(after)
  })

  it('reuses an existing tag by name instead of creating a second one', () => {
    const history = createHistoryStore(projectWith())
    history
      .getState()
      .execute(
        acceptSuggestionsCommand({ mediaId: 'm1', tags: ['Outdoor', 'A-roll'], moments: [], newId })
      )
    const after = history.getState().present
    expect(after.mediaTags).toEqual([{ id: 'outdoor', name: 'outdoor' }])
    expect(after.media[0].tagIds).toEqual(['a-roll', 'outdoor'])
  })

  it('does not save a moment twice when its range is already saved', () => {
    const saved: Moment = {
      id: 'saved',
      mediaId: 'm1',
      name: 'Hook',
      inMs: 1000,
      outMs: 9000,
      tags: [],
      createdBy: 'user'
    }
    const history = createHistoryStore(projectWith([saved]))
    const changed = history
      .getState()
      .execute(
        acceptSuggestionsCommand({ mediaId: 'm1', tags: [], moments: [suggestedMoments[0]], newId })
      )
    expect(changed).toBe(false)
    expect(history.getState().present.moments).toEqual([saved])
  })
})
