// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Component test for the Batch dialog's Assemble approved button (#262). It is disabled until a script
// is approved, and a click starts one assembly batch for the approved scripts. Stores are stubbed.

const store = vi.hoisted(() => ({
  state: { current: null as unknown },
  startAssemblyBatch: vi.fn()
}))

vi.mock('@renderer/features/project/useProjectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector(store.state)
}))

vi.mock('@renderer/features/assembly/assemblyQueueStore', () => ({
  startAssemblyBatch: store.startAssemblyBatch
}))

import { GenerateScriptsDialog } from '@renderer/features/scripts/GenerateScriptsDialog'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function setScripts(approvals: Array<'approved' | 'draft'>): void {
  store.state = {
    current: {
      folderPath: 'C:/projects/p1',
      project: {
        id: 'p1',
        media: [],
        scripts: approvals.map((approval, index) => ({ id: `s${index}`, approval }))
      }
    }
  }
}

let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  store.startAssemblyBatch.mockReset()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function renderDialog(): void {
  act(() =>
    root?.render(createElement(GenerateScriptsDialog, { open: true, onOpenChange: vi.fn() }))
  )
}

function assembleButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll('button'))
  return (
    (buttons.find((button) => button.textContent === 'Assemble approved') as
      HTMLButtonElement | undefined) ?? null
  )
}

describe('Batch dialog: Assemble approved', () => {
  it('is disabled while no script is approved', () => {
    setScripts(['draft', 'draft'])
    renderDialog()
    expect(assembleButton()?.disabled).toBe(true)
  })

  it('is enabled once a script is approved', () => {
    setScripts(['draft', 'approved'])
    renderDialog()
    expect(assembleButton()?.disabled).toBe(false)
  })

  it('starts one assembly batch for the approved scripts only', () => {
    setScripts(['approved', 'draft', 'approved'])
    renderDialog()
    act(() => assembleButton()?.click())
    expect(store.startAssemblyBatch).toHaveBeenCalledWith(['s0', 's2'], false)
  })
})
