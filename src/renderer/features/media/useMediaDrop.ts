// Lets files be dropped anywhere in the window. Without this, Electron would open a dropped file in
// place of the editor.
import { useEffect } from 'react'
import { importMediaPaths } from './importMedia'

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

export function useMediaDrop(): void {
  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      if (carriesFiles(event)) event.preventDefault()
    }
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      const files = [...(event.dataTransfer?.files ?? [])]
      void importMediaPaths(files.map((file) => window.api.pathForFile(file)))
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])
}
