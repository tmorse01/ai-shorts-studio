// Project-level commands for shorts: create, rename, duplicate, reorder, set status and delete. Each
// one is a Command<Project> for the project history, so do and undo come from the history engine.
// The caller supplies ids and timestamps, which keeps every command deterministic in tests.
import { current, type Draft } from 'immer'
import type { Project, Short, ShortStatus } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

type ProjectDraft = Draft<Project>

// The statuses a user sets by hand. Exported is set by export only.
export type ManualShortStatus = Exclude<ShortStatus, 'exported'>

// "Short N", where N is one more than the highest existing "Short N" name.
export function nextShortName(shorts: readonly { name: string }[]): string {
  const highest = shorts.reduce((max, short) => {
    const match = /^Short (\d+)$/.exec(short.name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `Short ${highest + 1}`
}

function indexOfShort(draft: ProjectDraft, shortId: string): number {
  const index = draft.shorts.findIndex((short) => short.id === shortId)
  if (index === -1) throw new Error(`No short with id ${shortId}`)
  return index
}

// Keeps each short's `order` equal to its position in the list.
function renumber(shorts: ProjectDraft['shorts']): void {
  shorts.forEach((short, index) => {
    short.order = index
  })
}

// A content edit. Editing an Exported short flags it until its next export.
function markEdited(short: Draft<Short>, now: string): void {
  short.updatedAt = now
  if (short.status === 'exported') short.editedSinceExport = true
}

export function createShortCommand(shortId: string, now: string): Command<Project> {
  return {
    label: 'Create short',
    produce: (draft) => {
      draft.shorts.push({
        id: shortId,
        name: nextShortName(draft.shorts),
        createdAt: now,
        updatedAt: now,
        status: 'draft',
        order: draft.shorts.length,
        targetLength: { ...draft.defaults.targetLength },
        platform: draft.defaults.platform,
        overrides: {},
        editedSinceExport: false,
        timeline: {}
      })
    }
  }
}

export function renameShortCommand(shortId: string, name: string, now: string): Command<Project> {
  return {
    label: 'Rename short',
    produce: (draft) => {
      const trimmed = name.trim()
      if (trimmed === '') throw new Error('A short needs a name.')
      const short = draft.shorts[indexOfShort(draft, shortId)]
      short.name = trimmed
      markEdited(short, now)
    }
  }
}

// The copy is a deep copy with its own id, placed right after the original. Exported shorts copy
// as Draft, since the copy has not been exported.
export function duplicateShortCommand(
  sourceId: string,
  copyId: string,
  now: string
): Command<Project> {
  return {
    label: 'Duplicate short',
    produce: (draft) => {
      const index = indexOfShort(draft, sourceId)
      const source = current(draft.shorts[index])
      const copy: Short = structuredClone(source)
      copy.id = copyId
      copy.name = `${source.name} copy`
      copy.createdAt = now
      copy.updatedAt = now
      copy.editedSinceExport = false
      if (copy.status === 'exported') {
        copy.status = 'draft'
        delete copy.exportedAt
      }
      draft.shorts.splice(index + 1, 0, copy)
      renumber(draft.shorts)
    }
  }
}

// Moves a short so it ends up at `toIndex` in the final list. Out-of-range values are clamped.
export function reorderShortCommand(shortId: string, toIndex: number): Command<Project> {
  return {
    label: 'Reorder shorts',
    produce: (draft) => {
      const [moved] = draft.shorts.splice(indexOfShort(draft, shortId), 1)
      const to = Math.min(Math.max(toIndex, 0), draft.shorts.length)
      draft.shorts.splice(to, 0, moved)
      renumber(draft.shorts)
    }
  }
}

export function setShortStatusCommand(
  shortId: string,
  status: ManualShortStatus,
  now: string
): Command<Project> {
  return {
    label: 'Set short status',
    produce: (draft) => {
      const short = draft.shorts[indexOfShort(draft, shortId)]
      if (short.status === 'exported') {
        throw new Error('An exported short keeps its status until it is exported again.')
      }
      short.status = status
      short.updatedAt = now
    }
  }
}

export function deleteShortCommand(shortId: string): Command<Project> {
  return {
    label: 'Delete short',
    produce: (draft) => {
      draft.shorts.splice(indexOfShort(draft, shortId), 1)
      renumber(draft.shorts)
    }
  }
}
