// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Short, ShortDefaults } from '@shared/project/schema'
import { ShortCard, type ShortCardProps } from '@renderer/features/shorts/ShortCard'

// Component test for the empty-short placeholder (#262). The DOM environment is only for this file.

const EMPTY_TEXT = 'Empty · open to add clips'

const defaults: ShortDefaults = {
  targetLength: { minSec: 30, maxSec: 60 },
  platform: 'generic',
  safeZones: true
}

function shortWithClips(clipCount: number): Short {
  const clips = Array.from({ length: clipCount }, (_, index) => ({ id: `clip-${index}` }))
  return {
    id: 's1',
    name: 'Short 1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: {
      tracks: [{ id: 'main', kind: 'video', role: 'main', muted: false, clips }]
    }
  } as unknown as Short
}

function props(short: Short): ShortCardProps {
  return {
    short,
    target: defaults,
    renaming: false,
    onOpen: vi.fn(),
    onStartRename: vi.fn(),
    onCommitRename: vi.fn(),
    onCancelRename: vi.fn(),
    onDuplicate: vi.fn(),
    onSetStatus: vi.fn(),
    onDelete: vi.fn(),
    onKeep: vi.fn(),
    draggable: false,
    onMove: vi.fn(),
    onDragStart: vi.fn(),
    onDropHere: vi.fn()
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

function render(short: Short): void {
  root = createRoot(container)
  act(() => root?.render(createElement(ShortCard, props(short))))
}

describe('ShortCard empty placeholder', () => {
  it('shows the faint frame and the empty label for a short with no clips', () => {
    render(shortWithClips(0))
    const frame = container.querySelector('[data-empty="true"]')
    expect(frame).not.toBeNull()
    expect(frame?.textContent).toContain(EMPTY_TEXT)
  })

  it('shows no empty frame once the short has a clip', () => {
    render(shortWithClips(1))
    expect(container.querySelector('[data-empty="true"]')).toBeNull()
    expect(container.textContent).not.toContain(EMPTY_TEXT)
  })

  it('keeps the open control and the name on the empty card', () => {
    render(shortWithClips(0))
    expect(container.querySelector('[aria-label="Open Short 1"]')).not.toBeNull()
    expect(container.textContent).toContain('Short 1')
  })
})
