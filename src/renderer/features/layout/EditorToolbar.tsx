import { Link } from '@tanstack/react-router'
import { Download, FileInput, Film, Keyboard, Redo2, Undo2 } from 'lucide-react'
import { APP_NAME } from '@shared/app'
import { Button } from '@renderer/ui/Button'
import { useProjectStore } from '@renderer/features/project/useProjectStore'
import { redoEdit, undoEdit, useEditAvailability } from '@renderer/features/history/editActions'
import { IconButton } from '@renderer/ui/IconButton'
import { shortcutHelpStore } from '@renderer/features/shortcuts/shortcutHelpStore'
import { pickAndImportMedia } from '@renderer/features/media/importMedia'
import { ShortSwitcher } from '@renderer/features/shorts/ShortSwitcher'
import {
  previewSettingsStore,
  usePreviewSettings
} from '@renderer/features/preview/previewSettingsStore'
import { useUiStore } from './useUiStore'
import styles from './EditorToolbar.module.css'

const PROJECT_NAME_PLACEHOLDER = 'Untitled project'

// Undo and redo here run the same actions as Ctrl+Z and Ctrl+Y. A button is disabled when there is
// nothing to undo or redo.
export function EditorToolbar() {
  const projectName = useProjectStore((s) => s.current?.project.name)
  const { canUndo, canRedo } = useEditAvailability()
  const setLeftTool = useUiStore((s) => s.setLeftTool)
  const setPaneCollapsed = useUiStore((s) => s.setPaneCollapsed)
  const useOriginals = usePreviewSettings((s) => s.useOriginals)

  return (
    <header className={styles.toolbar}>
      <div className={styles.group}>
        <Link to="/" className={styles.logo} aria-label={`${APP_NAME}, back to projects`}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.wordmark}>{APP_NAME}</span>
        </Link>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.projectName}>{projectName ?? PROJECT_NAME_PLACEHOLDER}</span>
        <ShortSwitcher />
        <span className={styles.saveStatus}>
          <span className={styles.saveDot} aria-hidden="true" />
          Saved
        </span>
      </div>

      <div className={styles.group}>
        <IconButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={() => undoEdit()} />
        <IconButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={() => redoEdit()} />
        <Button
          variant={useOriginals ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={useOriginals}
          title="Play the source files instead of proxies"
          onClick={() => previewSettingsStore.getState().setUseOriginals(!useOriginals)}
        >
          <Film size={14} strokeWidth={1.75} aria-hidden="true" />
          Originals
        </Button>
        <IconButton
          icon={FileInput}
          label="Import media"
          onClick={() => void pickAndImportMedia()}
        />
        <IconButton
          icon={Keyboard}
          label="Keyboard shortcuts"
          onClick={() => shortcutHelpStore.getState().setOpen(true)}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setLeftTool('export')
            setPaneCollapsed('left', false)
          }}
        >
          <Download size={14} strokeWidth={1.75} aria-hidden="true" />
          Export
        </Button>
      </div>
    </header>
  )
}
