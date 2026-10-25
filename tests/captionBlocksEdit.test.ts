// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Track } from '@shared/timeline/timeline'
import { CaptionBlocks } from '@renderer/features/captions/CaptionBlocks'

// Regression test (#275, #294). A double click on a caption block must open the inline text editor,
// including when it lands on the selected block's Caption menu, which sits over the block's top right.
// Without the fix the menu swallowed the double click and the editor never opened.

const track = {
  id: 'captions-1',
  role: 'captions',
  name: 'Captions',
  locked: false,
  captions: [
    {
      id: 'block-1',
      words: [
        { text: 'Hello', startMs: 0, endMs: 500 },
        { text: 'there', startMs: 500, endMs: 1000 }
      ]
    }
  ]
} as unknown as Track

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom has no pointer capture; the block calls it on press.
  HTMLElement.prototype.setPointerCapture = () => {}
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

function fire(element: Element, type: string): void {
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
  })
}

describe('caption block double click', () => {
  it('opens the text editor from a double click on the block', () => {
    root = createRoot(container)
    act(() => {
      root?.render(
        createElement(CaptionBlocks, {
          track,
          pxPerMs: 0.1,
          playheadMs: 0,
          newId: () => 'new-id',
          runEdit: () => true
        })
      )
    })
    const block = container.querySelector('[data-block-id="block-1"]') as HTMLElement
    // A click selects the block, which shows its Caption menu.
    fire(block, 'pointerdown')
    fire(block, 'pointerup')
    fire(block, 'dblclick')
    expect(container.querySelector('input[aria-label="Caption text"]')).not.toBeNull()
  })

  it('opens the text editor when the double click lands on the Caption menu', () => {
    root = createRoot(container)
    act(() => {
      root?.render(
        createElement(CaptionBlocks, {
          track,
          pxPerMs: 0.1,
          playheadMs: 0,
          newId: () => 'new-id',
          runEdit: () => true
        })
      )
    })
    const block = container.querySelector('[data-block-id="block-1"]') as HTMLElement
    fire(block, 'pointerdown')
    fire(block, 'pointerup')
    const menuButton = Array.from(block.querySelectorAll('button')).find(
      (button) => button.textContent === 'Caption'
    )
    expect(menuButton).toBeDefined()
    fire(menuButton as HTMLElement, 'dblclick')
    expect(container.querySelector('input[aria-label="Caption text"]')).not.toBeNull()
  })
})
