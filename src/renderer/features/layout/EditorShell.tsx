import { useEffect } from 'react'
import type { Timeline } from '@shared/timeline/timeline'
import { registerEditorShortcuts } from '@renderer/features/shortcuts/editorShortcuts'
import { ShortcutsDialog } from '@renderer/features/shortcuts/ShortcutsDialog'
import { shortcutRegistry } from '@renderer/features/shortcuts/shortcutRegistry'
import { MediaPanel } from '@renderer/features/media/MediaPanel'
import { Inspector } from '@renderer/features/inspector/Inspector'
import { useMediaDrop } from '@renderer/features/media/useMediaDrop'
import { LEFT_TOOL_DEFINITIONS } from './leftTools'
import { EditorToolbar } from './EditorToolbar'
import { EmptyState } from './EmptyState'
import { PaneFrame } from './PaneFrame'
import { PreviewCanvas } from './PreviewCanvas'
import { ToolRail } from './ToolRail'
import { useEditorLayoutPersistence } from './useEditorLayoutPersistence'
import { useUiStore } from './useUiStore'
import styles from './EditorShell.module.css'

// The five-area editor (DESIGN.md section 4): toolbar on top, tool rail and left panel, centre
// preview, right inspector, and a full-width timeline along the bottom.
export interface EditorShellProps {
  // The open short's timeline. Empty when no short is open.
  timeline?: Timeline
}

export function EditorShell({ timeline }: EditorShellProps) {
  const leftTool = useUiStore((s) => s.leftTool)
  const toolDef = LEFT_TOOL_DEFINITIONS[leftTool]
  useEditorLayoutPersistence()
  useMediaDrop()

  useEffect(() => registerEditorShortcuts(shortcutRegistry), [])

  return (
    <div className={styles.shell}>
      <EditorToolbar />
      <div className={styles.main}>
        <div className={styles.row}>
          <ToolRail />
          <PaneFrame pane="left" title={toolDef.label} accent={toolDef.ai ? 'ai' : 'default'}>
            {leftTool === 'media' ? (
              <MediaPanel />
            ) : (
              <EmptyState
                title={toolDef.label}
                description={toolDef.emptyDescription}
                accent={toolDef.ai ? 'ai' : 'default'}
              />
            )}
          </PaneFrame>
          <PreviewCanvas timeline={timeline} />
          <PaneFrame pane="right" title="Inspector">
            <Inspector />
          </PaneFrame>
        </div>
        <PaneFrame pane="bottom" title="Timeline">
          <EmptyState
            title="No timeline yet"
            description="Clips, captions and music will sit on tracks here once a short has footage."
          />
        </PaneFrame>
      </div>
      <ShortcutsDialog />
    </div>
  )
}
