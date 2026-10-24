// Project-level commands for scripts: create, edit a line, add, remove and reorder lines, and attach
// a script to a short. Each is a Command<Project>, so it runs through the project history and can be
// undone. The caller supplies ids and timestamps, which keeps every command deterministic in tests.
import type { Draft } from 'immer'
import type { Project, Script, ScriptLine } from '@shared/project/schema'
import type { Command } from '../history/historyStore'
import { createShortCommand, markEdited } from '../shorts/shortCommands'

type ProjectDraft = Draft<Project>

function findScript(draft: ProjectDraft, scriptId: string): ProjectDraft['scripts'][number] {
  const script = draft.scripts.find((item) => item.id === scriptId)
  if (!script) throw new Error('This script no longer exists.')
  return script
}

function lineIndex(script: ProjectDraft['scripts'][number], lineId: string): number {
  const index = script.lines.findIndex((line) => line.id === lineId)
  if (index === -1) throw new Error('This line no longer exists.')
  return index
}

function pushScript(draft: ProjectDraft, script: Script): void {
  const title = script.title.trim()
  if (title === '') throw new Error('A script needs a title.')
  if (draft.scripts.some((existing) => existing.id === script.id)) {
    throw new Error('A script with this id already exists.')
  }
  draft.scripts.push({
    id: script.id,
    title,
    topic: script.topic.trim(),
    lines: script.lines.map((line) => ({ ...line }))
  })
}

export function createScriptCommand(script: Script): Command<Project> {
  return {
    label: `Create script ${script.title.trim()}`,
    produce: (draft) => pushScript(draft, script)
  }
}

// Adds several scripts in one step, so one undo removes the whole batch (for example, AI drafts).
export function createScriptsCommand(scripts: readonly Script[]): Command<Project> {
  return {
    label:
      scripts.length === 1
        ? `Create script ${scripts[0].title.trim()}`
        : `Create ${scripts.length} scripts`,
    produce: (draft) => {
      for (const script of scripts) pushScript(draft, script)
    }
  }
}

// Replaces the text of one line. Repeated edits to the same line merge into one undo step.
export function editScriptLineCommand(
  scriptId: string,
  lineId: string,
  text: string
): Command<Project> {
  return {
    label: 'Edit script line',
    mergeKey: `script-line:${scriptId}:${lineId}`,
    produce: (draft) => {
      const script = findScript(draft, scriptId)
      script.lines[lineIndex(script, lineId)].text = text
    }
  }
}

// Inserts a line at `index`, or at the end when no index is given.
export function addScriptLineCommand(
  scriptId: string,
  line: ScriptLine,
  index?: number
): Command<Project> {
  return {
    label: 'Add script line',
    produce: (draft) => {
      const script = findScript(draft, scriptId)
      if (script.lines.some((existing) => existing.id === line.id)) {
        throw new Error('This line is already in the script.')
      }
      const at = index ?? script.lines.length
      if (!Number.isInteger(at) || at < 0 || at > script.lines.length) {
        throw new Error('The line cannot go at that position.')
      }
      script.lines.splice(at, 0, { ...line })
    }
  }
}

export function removeScriptLineCommand(scriptId: string, lineId: string): Command<Project> {
  return {
    label: 'Remove script line',
    produce: (draft) => {
      const script = findScript(draft, scriptId)
      script.lines.splice(lineIndex(script, lineId), 1)
    }
  }
}

// Moves one line to `toIndex` in the final list. The index must be within the script.
export function moveScriptLineCommand(
  scriptId: string,
  lineId: string,
  toIndex: number
): Command<Project> {
  return {
    label: 'Reorder script line',
    produce: (draft) => {
      const script = findScript(draft, scriptId)
      const from = lineIndex(script, lineId)
      if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= script.lines.length) {
        throw new Error('The line cannot go at that position.')
      }
      const [line] = script.lines.splice(from, 1)
      script.lines.splice(toIndex, 0, line)
    }
  }
}

// Attaches a script to a short, or detaches it when `scriptId` is null. Editing a short flags it,
// the same as any other content edit.
export function attachScriptCommand(
  shortId: string,
  scriptId: string | null,
  now: string
): Command<Project> {
  return {
    label: scriptId === null ? 'Detach script' : 'Attach script',
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === shortId)
      if (!short) throw new Error('This short no longer exists.')
      if (scriptId === null) {
        delete short.scriptId
      } else {
        if (!draft.scripts.some((item) => item.id === scriptId)) {
          throw new Error('This script no longer exists.')
        }
        short.scriptId = scriptId
      }
      markEdited(short, now)
    }
  }
}

// Creates a short and attaches the script to it as one command, so a single undo removes both.
export function createShortFromScriptCommand(
  shortId: string,
  scriptId: string,
  now: string
): Command<Project> {
  const create = createShortCommand(shortId, now)
  const attach = attachScriptCommand(shortId, scriptId, now)
  return {
    label: 'Create short from script',
    produce: (draft) => {
      create.produce(draft)
      attach.produce(draft)
    }
  }
}
