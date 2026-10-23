/**
 * The clip-generation pipeline as data. Main process code marks stages as they run; the renderer draws
 * the same graph from these definitions. Kept free of Node and DOM imports so both sides can use it.
 */

export type StageId = 'speech' | 'scenes' | 'candidates' | 'frames' | 'rank' | 'save'

/** Which technology a stage runs on. The renderer maps each one to a brand icon. */
export type TechId = 'parakeet' | 'ffmpeg' | 'claude' | 'cpu' | 'disk'

export type StageState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export type EdgeState = 'idle' | 'active' | 'done' | 'skipped'

export interface StageDef {
  id: StageId
  label: string
  tech: TechId
  /** Grid position. Columns run left to right; rows are lanes, so parallel stages share a column. */
  col: number
  row: number
}

export interface StageStatus {
  id: StageId
  state: StageState
  /** One short line shown under the label, such as "3 of 12" or why a stage was skipped. */
  detail: string | null
}

export interface EdgeDef {
  from: StageId
  to: StageId
}

export const ANALYSIS_STAGES: readonly StageDef[] = [
  { id: 'speech', label: 'Transcribe speech', tech: 'parakeet', col: 0, row: 0 },
  { id: 'scenes', label: 'Detect scene changes', tech: 'ffmpeg', col: 0, row: 1 },
  { id: 'candidates', label: 'Build candidate windows', tech: 'cpu', col: 1, row: 0.5 },
  { id: 'frames', label: 'Sample frames', tech: 'ffmpeg', col: 2, row: 0.5 },
  { id: 'rank', label: 'Rank moments with Claude', tech: 'claude', col: 3, row: 0.5 },
  { id: 'save', label: 'Save shorts', tech: 'disk', col: 4, row: 0.5 }
]

export const ANALYSIS_EDGES: readonly EdgeDef[] = [
  { from: 'speech', to: 'candidates' },
  { from: 'scenes', to: 'candidates' },
  { from: 'candidates', to: 'frames' },
  { from: 'frames', to: 'rank' },
  { from: 'rank', to: 'save' }
]

/** Every stage pending. A new analysis job starts from this. */
export function initialStages(defs: readonly StageDef[] = ANALYSIS_STAGES): StageStatus[] {
  return defs.map((d) => ({ id: d.id, state: 'pending', detail: null }))
}

/** Returns a new list with one stage changed. The input is never mutated. */
export function setStage(
  stages: readonly StageStatus[],
  id: StageId,
  state: StageState,
  detail: string | null = null
): StageStatus[] {
  return stages.map((s) => (s.id === id ? { id, state, detail } : s))
}

/**
 * What an edge should look like. An edge is `active` while its target is running and its source has
 * finished, `done` once the target finishes, and `skipped` when its source was skipped or failed.
 */
export function edgeState(from: StageState, to: StageState): EdgeState {
  if (from === 'skipped' || from === 'failed') return 'skipped'
  if (from !== 'done') return 'idle'
  if (to === 'running') return 'active'
  if (to === 'done') return 'done'
  return 'idle'
}

/** The share of the job that is finished, from 0 to 1, weighting every stage equally. */
export function stagesProgress(stages: readonly StageStatus[]): number {
  if (stages.length === 0) return 0
  const finished = stages.filter((s) => s.state === 'done' || s.state === 'skipped').length
  return finished / stages.length
}
