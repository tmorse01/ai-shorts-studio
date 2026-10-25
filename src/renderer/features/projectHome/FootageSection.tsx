import type { JSX } from 'react'
import { useStore } from 'zustand'
import { useRouter } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import type { MediaRef, Short } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { MediaPanel } from '../media/MediaPanel'
import { mediaPanelStore } from '../media/mediaPanelStore'
import { pickAndImportMedia } from '../media/importMedia'
import { reanalyzeMedia, syncAnalysis } from '../analysis/analysisSync'
import { uiStore } from '../layout/useUiStore'
import { useProjectStore } from '../project/useProjectStore'
import styles from './FootageSection.module.css'

const NO_MEDIA: MediaRef[] = []
const NO_SHORTS: Short[] = []

// The Footage section of Project home, first on the page. It holds the import drop zone, the
// analysis actions, a shortcut to Clip Finder, and the media grid once footage exists. Files dropped
// anywhere on the page import through useMediaDrop in the route.
export function FootageSection(): JSX.Element {
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? null)
  const projectId = useProjectStore((state) => state.current?.project.id ?? null)
  const media = useProjectStore((state) => state.current?.project.media ?? NO_MEDIA)
  const shorts = useProjectStore((state) => state.current?.project.shorts ?? NO_SHORTS)
  const selectedIds = useStore(mediaPanelStore, (state) => state.selection.ids)
  const router = useRouter()

  const selected = media.filter((ref) => selectedIds.includes(ref.id))
  const hasFootage = media.length > 0
  // Clip Finder lives in the editor, so the shortcut opens the newest short with that tool selected.
  const clipFinderShort = shorts[0]

  function analyseAll() {
    if (folderPath) void syncAnalysis(window.api, folderPath, media)
  }

  function analyseSelected() {
    if (!folderPath) return
    void Promise.all(selected.map((ref) => reanalyzeMedia(window.api, folderPath, ref)))
  }

  function openClipFinder() {
    if (!projectId || !clipFinderShort) return
    uiStore.getState().setLeftTool('ai-clip-finder')
    void router.navigate({
      to: '/project/$projectId/short/$shortId',
      params: { projectId, shortId: clipFinderShort.id }
    })
  }

  return (
    <div className={styles.section}>
      <div className={hasFootage ? styles.dropZoneCompact : styles.dropZone}>
        {hasFootage ? null : <Upload size={22} strokeWidth={1.75} aria-hidden="true" />}
        <p className={styles.dropText}>
          {hasFootage
            ? 'Drop files anywhere on this page to add more footage.'
            : 'No footage yet. Drop video, audio or image files here, or import them.'}
        </p>
        <Button variant="primary" size="sm" onClick={() => void pickAndImportMedia()}>
          Import media
        </Button>
      </div>

      {hasFootage ? (
        <>
          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={analyseAll}>
              Analyse all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selected.length === 0}
              title={selected.length === 0 ? 'Select clips in the grid first' : undefined}
              onClick={analyseSelected}
            >
              {selected.length > 1 ? `Analyse ${selected.length} selected` : 'Analyse selected'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!clipFinderShort}
              title={clipFinderShort ? undefined : 'Make a short to open Clip Finder'}
              onClick={openClipFinder}
            >
              Clip Finder
            </Button>
          </div>
          <MediaPanel showImport={false} />
        </>
      ) : null}
    </div>
  )
}
