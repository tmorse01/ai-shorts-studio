// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { CURRENT_SCHEMA_VERSION, projectSchema, type Project } from '@shared/project/schema'
import { createAppRouter } from '@renderer/routes/appRouter'
import { projectStore } from '@renderer/features/project/projectStore'
import { uiStore } from '@renderer/features/layout/useUiStore'

// Smoke test for the editor route (#247). It mounts the whole route with a real project open and
// checks that the five editor areas render and nothing throws or logs an error. The DOM environment
// is only for this file; the rest of the suite runs under Node.

const project: Project = projectSchema.parse({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'p1',
  name: 'Smoke project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  media: [],
  mediaTags: [],
  moments: [],
  defaults: {
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    safeZones: true
  },
  shorts: [
    {
      id: 's1',
      name: 'First short',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: 'draft',
      order: 0,
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      overrides: {},
      editedSinceExport: false,
      timeline: { tracks: [] }
    }
  ],
  scripts: []
})

// jsdom has no ResizeObserver or matchMedia. The panes and fonts only need them to exist.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let container: HTMLDivElement
let root: Root | null = null
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia
  }
  // The editor's effects call the IPC bridge. In the app, the preload script provides it. Here it
  // answers every request with an empty success, so the features mount without real files.
  window.api = {
    invoke: vi.fn(async () => ({ ok: true, data: { sources: [], stats: [] } })),
    on: vi.fn(() => () => {}),
    pathForFile: () => ''
  } as unknown as typeof window.api
  // jsdom has no canvas and no scrolling. The preview falls back when a canvas has no context.
  window.scrollTo = () => {}
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext
  errorSpy = vi.spyOn(console, 'error')
  container = document.createElement('div')
  document.body.appendChild(container)
  projectStore.setState({
    current: { folderPath: 'G:\\Smoke\\Project', project },
    saveStatus: { kind: 'saved', savedAt: undefined }
  })
  uiStore.setState({ leftTool: 'media' })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  projectStore.setState({ current: null })
  delete (window as { api?: unknown }).api
  vi.unstubAllGlobals()
  errorSpy.mockRestore()
})

async function renderEditor(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAppRouter(history)
  await router.load()
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(RouterProvider, { router }))
  })
  return container
}

// Each pane is a labelled section. The labels show which areas mounted.
function paneLabels(): string[] {
  return Array.from(container.querySelectorAll('section[aria-label]')).map(
    (node) => node.getAttribute('aria-label') ?? ''
  )
}

describe('editor route smoke test', () => {
  it('renders the timeline, preview, inspector and left panel without throwing', async () => {
    await renderEditor('/project/p1/short/s1')

    expect(container.textContent).toContain('Smoke project')
    expect(paneLabels()).toEqual(
      expect.arrayContaining(['Media', 'Preview', 'Inspector', 'Timeline'])
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('opens the export screen for the open short from the toolbar', async () => {
    await renderEditor('/project/p1/short/s1')

    const exportButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Export'
    )
    expect(exportButton).toBeDefined()
    await act(async () => {
      exportButton?.click()
    })

    expect(uiStore.getState().leftTool).toBe('export')
    expect(container.textContent).toContain('First short')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
