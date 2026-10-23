import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_EDGES,
  ANALYSIS_STAGES,
  edgeState,
  initialStages,
  setStage,
  stagesProgress
} from '../src/shared/pipeline-graph'

describe('analysis graph definition', () => {
  it('has an edge only between known stages, and no stage points back to itself', () => {
    const ids = new Set(ANALYSIS_STAGES.map((s) => s.id))
    for (const edge of ANALYSIS_EDGES) {
      expect(ids.has(edge.from)).toBe(true)
      expect(ids.has(edge.to)).toBe(true)
      expect(edge.from).not.toBe(edge.to)
    }
  })

  it('feeds both parallel branches into the same join stage', () => {
    const into = ANALYSIS_EDGES.filter((e) => e.to === 'candidates').map((e) => e.from)
    expect(into.sort()).toEqual(['scenes', 'speech'])
  })
})

describe('edgeState', () => {
  it('is active while the target runs after a finished source', () => {
    expect(edgeState('done', 'running')).toBe('active')
  })

  it('is done once the target finishes', () => {
    expect(edgeState('done', 'done')).toBe('done')
  })

  it('stays idle while the source is still pending or running', () => {
    expect(edgeState('pending', 'pending')).toBe('idle')
    expect(edgeState('running', 'pending')).toBe('idle')
  })

  it('is skipped when the source was skipped or failed', () => {
    expect(edgeState('skipped', 'running')).toBe('skipped')
    expect(edgeState('failed', 'pending')).toBe('skipped')
  })
})

describe('stage state', () => {
  it('starts every stage pending with no detail', () => {
    const stages = initialStages()
    expect(stages).toHaveLength(ANALYSIS_STAGES.length)
    expect(stages.every((s) => s.state === 'pending' && s.detail === null)).toBe(true)
  })

  it('changes one stage without touching the others or the input', () => {
    const before = initialStages()
    const after = setStage(before, 'frames', 'running', '3 of 12')
    expect(after.find((s) => s.id === 'frames')).toEqual({
      id: 'frames',
      state: 'running',
      detail: '3 of 12'
    })
    expect(after.filter((s) => s.id !== 'frames')).toEqual(before.filter((s) => s.id !== 'frames'))
    expect(before.find((s) => s.id === 'frames')?.state).toBe('pending')
  })

  it('counts done and skipped stages toward progress', () => {
    let stages = initialStages()
    expect(stagesProgress(stages)).toBe(0)
    stages = setStage(stages, 'speech', 'done')
    stages = setStage(stages, 'scenes', 'skipped')
    expect(stagesProgress(stages)).toBeCloseTo(2 / ANALYSIS_STAGES.length)
  })
})
