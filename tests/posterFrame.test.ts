// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PosterFrame, type PosterFrameProps } from '@renderer/features/shorts/PosterFrame'
import type { PosterView } from '@renderer/features/shorts/posterRequests'

// Component test for the poster slot: the empty, loading, loaded and error states. The DOM environment is
// only for this file.

const SRC = 'aism-media://poster/short1/vid1-2000.jpg?v=1'

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

function render(view: PosterView, onEdit = vi.fn()): void {
  const props: PosterFrameProps = {
    view,
    alt: 'Poster for Short 1',
    emptyAction: createElement('button', { type: 'button', onClick: onEdit }, 'Edit thumbnail')
  }
  root = createRoot(container)
  act(() => root?.render(createElement(PosterFrame, props)))
}

describe('PosterFrame states', () => {
  it('empty: faint frame, icon, "No poster yet" and the Edit thumbnail action', () => {
    const onEdit = vi.fn()
    render({ status: 'empty' }, onEdit)

    const frame = container.querySelector('[data-state="empty"]')
    expect(frame).not.toBeNull()
    expect(frame?.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toContain('No poster yet')
    expect(container.querySelector('img')).toBeNull()

    const edit = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Edit thumbnail'
    )
    act(() => edit?.click())
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('loading: a spinner and a status line while the poster job runs, no image', () => {
    render({ status: 'loading' })

    const frame = container.querySelector('[data-state="loading"]')
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute('role')).toBe('status')
    expect(frame?.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).not.toContain('No poster yet')
  })

  it('loaded: the rendered frame in an image with the alt text', () => {
    render({ status: 'ready', src: SRC })

    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe(SRC)
    expect(image?.getAttribute('alt')).toBe('Poster for Short 1')
    expect(container.querySelector('[data-state="loaded"]')).not.toBeNull()
  })

  it('error: a failed image falls back to the empty state, never a broken image', () => {
    render({ status: 'ready', src: SRC })

    const image = container.querySelector('img')
    act(() => {
      image?.dispatchEvent(new Event('error'))
    })

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-state="empty"]')).not.toBeNull()
    expect(container.textContent).toContain('No poster yet')
  })

  it('error: a new source gets a fresh try instead of staying on the empty state', () => {
    render({ status: 'ready', src: SRC })
    act(() => {
      container.querySelector('img')?.dispatchEvent(new Event('error'))
    })

    act(() => {
      root?.render(
        createElement(PosterFrame, {
          view: { status: 'ready', src: 'aism-media://poster/short1/vid1-4500.jpg?v=2' },
          alt: 'Poster for Short 1'
        })
      )
    })

    expect(container.querySelector('img')?.getAttribute('src')).toContain('vid1-4500.jpg')
  })
})
