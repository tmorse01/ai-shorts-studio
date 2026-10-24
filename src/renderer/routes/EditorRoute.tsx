import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { EditorShell } from '@renderer/features/layout/EditorShell'
import { rootRoute } from './rootRoute'

export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId/short/$shortId',
  component: EditorPage
})

// The shell does not read the project or short yet: the project store arrives with epic 02.
function EditorPage(): JSX.Element {
  return <EditorShell />
}
