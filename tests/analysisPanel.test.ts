// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { newAnalysisRecord, withStageStatus, type AnalysisFile } from '@shared/analysis/analysis'
import type { JobSnapshot } from '@shared/media/jobs'
import type { MediaRef } from '@shared/project/schema'
import { AnalysisPanelBody } from '@renderer/features/analysis/AnalysisPanel'

// Component tests for the Analysis panel's body (#310). The dialog wrapper is Radix and is not mounted
// here; the body holds the states the criteria name: running with a percentage, failed with Retry, and
// Cancel for work that has not finished.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function ref(id: string, fileName: string): MediaRef {
  return { id, fileName, kind: 'video' } as unknown as MediaRef
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(props: Parameters<typeof AnalysisPanelBody>[0]): void {
  act(() => {
    root.render(createElement(AnalysisPanelBody, props))
  })
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === label
  )
}

describe('AnalysisPanelBody', () => {
  it('shows the running stage with its percentage and offers Cancel', () => {
    const clip = ref('m1', 'bike-run.mp4')
    const file: AnalysisFile = {
      autoAnalyze: true,
      records: { m1: withStageStatus(newAnalysisRecord('m1'), 'shots', 'running') }
    }
    const jobs: Record<string, JobSnapshot> = {
      'job-1': {
        id: 'job-1',
        kind: 'analysis',
        label: 'bike-run.mp4',
        status: 'running',
        progress: 0.4
      }
    }
    const onCancel = vi.fn()
    render({ sources: [clip], file, jobs, onCancel, onRetry: vi.fn() })

    expect(container.textContent).toContain('Running 40%')
    button('Cancel')?.click()
    expect(onCancel).toHaveBeenCalledWith(clip)
    expect(button('Retry')).toBeUndefined()
  })

  it('shows a failed stage with its reason and a Retry that calls back', () => {
    const clip = ref('m2', 'interview.mp4')
    const record = withStageStatus(newAnalysisRecord('m2'), 'transcript', 'failed', {
      message: 'Transcribing failed.',
      details: 'model not found'
    })
    const onRetry = vi.fn()
    render({
      sources: [clip],
      file: { autoAnalyze: true, records: { m2: record } },
      jobs: {},
      onCancel: vi.fn(),
      onRetry
    })

    expect(container.textContent).toContain('Transcribing failed.')
    expect(container.textContent).toContain('Failed')
    button('Retry')?.click()
    expect(onRetry).toHaveBeenCalledWith(clip)
  })

  it('asks the user to select footage when no source is selected', () => {
    render({ sources: [], file: undefined, jobs: {}, onCancel: vi.fn(), onRetry: vi.fn() })
    expect(container.textContent).toContain('Select footage to see its analysis.')
  })
})
