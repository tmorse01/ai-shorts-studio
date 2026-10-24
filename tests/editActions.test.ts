import { beforeEach, describe, expect, it } from 'vitest'
import { editorHistory } from '@renderer/features/history/editorHistory'
import { redoEdit, undoEdit } from '@renderer/features/history/editActions'

interface Counter {
  count: number
}

describe('undo and redo with a short open', () => {
  beforeEach(() => {
    editorHistory.selection.getState().setActive(null)
  })

  it('undoes and redoes the active short history, and reports nothing to do', () => {
    const history = editorHistory.get('short-a')
    history.getState().reset({ count: 0 } as Counter & object)
    editorHistory.selection.getState().setActive('short-a')

    history.getState().execute({
      label: 'Add one',
      produce: (draft) => {
        ;(draft as Counter).count += 1
      }
    })
    expect(history.getState().present).toEqual({ count: 1 })

    expect(undoEdit()).toBe(true)
    expect(history.getState().present).toEqual({ count: 0 })
    expect(undoEdit()).toBe(false)

    expect(redoEdit()).toBe(true)
    expect(history.getState().present).toEqual({ count: 1 })
    expect(redoEdit()).toBe(false)
  })
})
