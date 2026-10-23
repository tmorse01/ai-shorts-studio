import { Modal } from '../chrome/Modal'

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: 'Ctrl+N', what: 'New project' },
  { keys: 'Ctrl+I', what: 'Add media to the project' },
  { keys: 'Ctrl+E', what: 'Export the checked clips' },
  { keys: 'Ctrl+,', what: 'Project settings' },
  { keys: 'Space', what: 'Play or pause the video' },
  { keys: '← / →', what: 'Seek 5 seconds (hold Shift for 1 second)' }
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys}>
              <td className="mono">{s.keys}</td>
              <td>{s.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
