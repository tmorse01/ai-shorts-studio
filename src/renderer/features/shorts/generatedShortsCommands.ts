// Creating one accepted proposal from Generate shorts (Epic 16, #311). One command makes one draft short, so one
// undo removes it. Each moment becomes an AI-labelled moment (createdBy 'ai', as the suggestions of #56 do),
// unless the project already has a moment with the same source and range, which is reused instead of
// duplicated. The short's Main track holds the moments' clips in order, and the short carries the batch-draft
// flag so it shows the Draft badge until the user keeps it.
import { IDENTITY_TRANSFORM, type Clip } from '@shared/timeline/timeline'
import type { GeneratedShort } from '@shared/shorts/shortPlan'
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

export interface CreateGeneratedShortInput {
  shortId: string
  /** The id of the short's Main track. */
  trackId: string
  short: GeneratedShort
  now: string
  /** Makes an id for each new moment and clip. */
  newId: () => string
}

export function createGeneratedShortCommand(input: CreateGeneratedShortInput): Command<Project> {
  const { short } = input
  return {
    label: `Create short "${short.title}"`,
    produce: (draft) => {
      if (draft.shorts.some((item) => item.id === input.shortId)) {
        throw new Error('This short already exists.')
      }
      const clips: Clip[] = []
      let cursor = 0
      for (const moment of short.moments) {
        if (!draft.media.some((item) => item.id === moment.mediaId)) {
          throw new Error('A clip for this short is no longer in the project.')
        }
        if (moment.outMs <= moment.inMs) {
          throw new Error('A moment needs an Out point after its In point.')
        }
        const existing = draft.moments.find(
          (item) =>
            item.mediaId === moment.mediaId &&
            item.inMs === moment.inMs &&
            item.outMs === moment.outMs
        )
        let momentId: string
        if (existing) {
          momentId = existing.id
        } else {
          momentId = input.newId()
          draft.moments.push({
            id: momentId,
            mediaId: moment.mediaId,
            name: moment.name,
            inMs: moment.inMs,
            outMs: moment.outMs,
            tags: [],
            createdBy: 'ai',
            ...(moment.note ? { note: moment.note } : {})
          })
        }
        const durationMs = moment.outMs - moment.inMs
        clips.push({
          id: input.newId(),
          mediaId: moment.mediaId,
          startMs: cursor,
          durationMs,
          sourceInMs: moment.inMs,
          transform: { ...IDENTITY_TRANSFORM },
          momentId
        })
        cursor += durationMs
      }

      draft.shorts.push({
        id: input.shortId,
        name: short.title,
        createdAt: input.now,
        updatedAt: input.now,
        status: 'draft',
        order: draft.shorts.length,
        targetLength: { ...draft.defaults.targetLength },
        platform: draft.defaults.platform,
        overrides: {},
        batchDraft: true,
        editedSinceExport: false,
        timeline: {
          tracks: [{ id: input.trackId, kind: 'video', role: 'main', muted: false, clips }]
        }
      })
    }
  }
}
