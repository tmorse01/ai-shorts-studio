// Exports a short's captions as an SRT file (Epic 11, #121). The text is built here from the short's
// timeline; main shows the save dialog and writes the file.
import { buildSrt, srtFileName } from '@shared/captions/srt'
import { projectStore } from '../project/projectStore'
import { toast } from '../toasts/toast'

export async function exportShortSrt(shortId: string): Promise<void> {
  const short = projectStore.getState().current?.project.shorts.find((item) => item.id === shortId)
  if (!short) return

  const srt = buildSrt(short.timeline)
  if (srt === '') {
    toast.info({
      title: 'No captions to export',
      description: 'Generate captions for this short first.'
    })
    return
  }

  const result = await window.api.invoke('captions:exportSrt', {
    suggestedName: srtFileName(short.name),
    srt
  })
  if (!result.ok) {
    toast.error({
      title: 'Could not save the SRT file',
      description: result.error.message,
      details: result.error.details
    })
    return
  }
  if (result.data.savedPath) {
    toast.success({ title: 'SRT saved', description: result.data.savedPath })
  }
}
