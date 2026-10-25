// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'
import { TimelinePane, type TimelinePaneProps } from '@renderer/features/timeline/TimelinePane'

// Component tests for the clip menu (#302). The floating Clip button is gone. A right-click on a clip,
// or Shift+F10 on a focused clip, opens the same menu. The DOM environment is only for this file.

// The poster button reads the router's params, and this test mounts the pane without a router.
vi.mock('@renderer/features/shorts/SetPosterButton', () => ({ SetPosterButton: () => null }))

// jsdom has no ResizeObserver. The pane only needs it to exist.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'm1',
    startMs: 0,
    durationMs: 5000,
    sourceInMs: 0,
    ...extra
  } as unknown as Clip
}

function timeline(): Timeline {
  const main: Track = {
    id: 'main',
    kind: 'video',
    role: 'main',
    muted: false,
    clips: [clip('a')]
  } as unknown as Track
  const music: Track = {
    id: 'music',
    kind: 'audio',
    role: 'music',
    muted: false,
    clips: [clip('m', { mediaId: 'm2' })]
  } as unknown as Track
  return { tracks: [main, music] } as unknown as Timeline
}

function paneProps(onEdit = vi.fn()): TimelinePaneProps {
  return {
    timeline: timeline(),
    target: { minMs: 30_000, maxMs: 60_000 },
    onEdit,
    newId: () => 'new-id'
  }
}

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.unstubAllGlobals()
})

async function render(props: TimelinePaneProps) {
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(TimelinePane, props))
  })
}

// The clip elements on the lanes, found by their track kind.
function clipElement(kind: 'video' | 'audio'): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[role="button"][data-kind="${kind}"]`)
  if (!element) throw new Error(`no ${kind} clip`)
  return element
}

// The open menu's items, which Radix portals into the document body.
function menuItemLabels(): string[] {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.textContent?.trim() ?? ''
  )
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text
  )
}

describe('timeline clip menu', () => {
  it('has no floating Clip button, even with a clip selected', async () => {
    await render(paneProps())
    // Enter selects the focused clip. The old floating button showed for a selected clip.
    await act(async () => {
      clipElement('video').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
    })
    expect(clipElement('video').getAttribute('aria-pressed')).toBe('true')
    expect(findButton('Clip')).toBeUndefined()
  })

  it('opens the clip menu from a right-click on a clip, and selects the clip', async () => {
    await render(paneProps())
    expect(menuItemLabels()).toEqual([])

    await act(async () => {
      clipElement('video').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 })
      )
    })

    expect(menuItemLabels()).toContain('Mute clip')
    expect(clipElement('video').getAttribute('aria-pressed')).toBe('true')
  })

  it('opens the same menu from Shift+F10 on the focused clip', async () => {
    await render(paneProps())
    const element = clipElement('audio')
    element.focus()

    await act(async () => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })
      )
    })

    expect(menuItemLabels()).toEqual(['Mute clip'])
  })

  it('opens the menu from the Menu key on the focused clip', async () => {
    await render(paneProps())
    await act(async () => {
      clipElement('audio').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true })
      )
    })
    expect(menuItemLabels()).toEqual(['Mute clip'])
  })

  it('does not open the menu for F10 without Shift', async () => {
    await render(paneProps())
    await act(async () => {
      clipElement('audio').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', bubbles: true })
      )
    })
    expect(menuItemLabels()).toEqual([])
  })

  it('runs the chosen item as one edit', async () => {
    const onEdit = vi.fn()
    await render(paneProps(onEdit))
    await act(async () => {
      clipElement('audio').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })
      )
    })

    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (element) => element.textContent?.trim() === 'Mute clip'
    )
    expect(item).toBeDefined()
    await act(async () => {
      item?.click()
    })

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith('Mute clip', expect.any(Function), undefined)
  })
})
