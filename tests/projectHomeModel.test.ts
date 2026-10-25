import { describe, expect, it } from 'vitest'
import {
  activeSection,
  guideSteps,
  showGuide
} from '../src/renderer/features/projectHome/projectHomeModel'

describe('guideSteps', () => {
  it('starts with only the import step enabled and nothing done', () => {
    const steps = guideSteps({ mediaCount: 0, momentCount: 0, shortCount: 0 })
    expect(steps.map((step) => [step.id, step.done, step.enabled])).toEqual([
      ['import', false, true],
      ['moments', false, false],
      ['short', false, false]
    ])
  })

  it('enables the moments step once footage exists, without marking it done', () => {
    const steps = guideSteps({ mediaCount: 2, momentCount: 0, shortCount: 0 })
    expect(steps[0]).toMatchObject({ done: true, enabled: true })
    expect(steps[1]).toMatchObject({ done: false, enabled: true })
    expect(steps[2]).toMatchObject({ done: false, enabled: false })
  })

  it('enables the short step only after a moment exists', () => {
    const steps = guideSteps({ mediaCount: 1, momentCount: 3, shortCount: 0 })
    expect(steps[1]).toMatchObject({ done: true, enabled: true })
    expect(steps[2]).toMatchObject({ done: false, enabled: true })
  })

  it('marks every step done once footage, moments and a short exist', () => {
    const steps = guideSteps({ mediaCount: 1, momentCount: 1, shortCount: 1 })
    expect(steps.every((step) => step.done)).toBe(true)
  })
})

describe('showGuide', () => {
  it('shows for a new project', () => {
    expect(showGuide({ mediaCount: 0, momentCount: 0, shortCount: 0 })).toBe(true)
  })

  it('shows while footage exists but no short does', () => {
    expect(showGuide({ mediaCount: 4, momentCount: 2, shortCount: 0 })).toBe(true)
  })

  it('hides once footage and a short exist', () => {
    expect(showGuide({ mediaCount: 4, momentCount: 0, shortCount: 1 })).toBe(false)
  })
})

describe('activeSection', () => {
  it('keeps the first section active before the page scrolls', () => {
    expect(
      activeSection([
        { id: 'project-footage', top: 200 },
        { id: 'project-shorts', top: 600 },
        { id: 'project-scripts', top: 900 }
      ])
    ).toBe('project-footage')
  })

  it('picks the last section whose top has reached the threshold', () => {
    expect(
      activeSection([
        { id: 'project-footage', top: -400 },
        { id: 'project-shorts', top: 20 },
        { id: 'project-scripts', top: 500 }
      ])
    ).toBe('project-shorts')
  })

  it('falls back to the first section when sections are not laid out yet', () => {
    expect(
      activeSection([
        { id: 'project-footage', top: Number.POSITIVE_INFINITY },
        { id: 'project-shorts', top: Number.POSITIVE_INFINITY },
        { id: 'project-scripts', top: Number.POSITIVE_INFINITY }
      ])
    ).toBe('project-footage')
  })
})
