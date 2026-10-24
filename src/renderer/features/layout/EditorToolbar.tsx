import { Link } from '@tanstack/react-router'
import { Download, FileInput, Film, Keyboard, Redo2, Undo2 } from 'lucide-react'
import { APP_NAME } from '@shared/app'
import { Button } from '@renderer/ui/Button'
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

// Until the project store lands (epic 02), the toolbar shows a placeholder name and status.
const PROJECT_NAME_PLACEHOLDER = 'Untitled project'

// Undo and redo are bound to Ctrl+Z and Ctrl+Y and stay disabled here until a short is open.
export function EditorToolbar() {
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
        <span className={styles.projectName}>{PROJECT_NAME_PLACEHOLDER}</span>
        <ShortSwitcher />
        <span className={styles.saveStatus}>
          <span className={styles.saveDot} aria-hidden="true" />
          Saved
        </span>
      </div>

      <div className={styles.group}>
        <IconButton icon={Undo2} label="Undo" disabled />
        <IconButton icon={Redo2} label="Redo" disabled />
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
