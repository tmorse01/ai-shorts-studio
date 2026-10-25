// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Component test for the guided start (#262). It checks the step list shows done or pending and that
// each button is gated by the step before it. The project store and router are stubbed.

const store = vi.hoisted(() => ({ state: { current: null as unknown } }))

vi.mock('@renderer/features/project/useProjectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector(store.state)
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: () => Promise.resolve() })
}))

import { GuidedStart } from '@renderer/features/projectHome/GuidedStart'

function setProject(counts: { media: number; moments: number; shorts: number }): void {
  store.state = {
    current: {
      folderPath: 'C:/projects/p1',
      project: {
        id: 'p1',
        media: Array.from({ length: counts.media }, (_, i) => ({ id: `m${i}` })),
        moments: Array.from({ length: counts.moments }, (_, i) => ({ id: `k${i}` })),
        shorts: Array.from({ length: counts.shorts }, (_, i) => ({ id: `s${i}` }))
      }
    }
  }
}

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

function render(): void {
  root = createRoot(container)
  act(() => root?.render(createElement(GuidedStart)))
}

// Each step as [state, button label or null, button disabled or null].
function steps(): Array<[string | null, string | null, boolean | null]> {
  return Array.from(container.querySelectorAll('li')).map((item) => {
    const button = item.querySelector('button')
    return [
      item.getAttribute('data-state'),
      button ? button.textContent : null,
      button ? button.disabled : null
    ]
  })
}

describe('GuidedStart', () => {
  it('starts with import enabled and the two later steps gated', () => {
    setProject({ media: 0, moments: 0, shorts: 0 })
    render()
    expect(steps()).toEqual([
      ['pending', 'Import media', false],
      ['pending', 'Analyse footage', true],
      ['pending', 'New short', true]
    ])
  })

  it('marks import done and enables analysis once footage exists', () => {
    setProject({ media: 2, moments: 0, shorts: 0 })
    render()
    expect(steps()).toEqual([
      ['done', null, null],
      ['pending', 'Analyse footage', false],
      ['pending', 'New short', true]
    ])
  })

  it('enables making a short once moments are marked', () => {
    setProject({ media: 2, moments: 3, shorts: 0 })
    render()
    expect(steps()).toEqual([
      ['done', null, null],
      ['done', null, null],
      ['pending', 'New short', false]
    ])
  })

  it('renders nothing once footage and a short both exist', () => {
    setProject({ media: 2, moments: 3, shorts: 1 })
    render()
    expect(container.querySelector('section')).toBeNull()
  })
})
