// Keeps the search index in step with the open project. When analysis finishes a stage, or a tag or
// moment changes, only the media items that changed are read again and re-indexed. Results from an
// older sync are dropped, so a slow read never overwrites a newer one.
import type { AnalysisFile, AnalysisRecord, ShotRange } from '@shared/analysis/analysis'
import type { Transcript } from '@shared/analysis/transcript'
import type { RendererApi, RendererInvokeApi, Unsubscribe } from '@shared/ipc'
import type { MediaRef, Project } from '@shared/project/schema'
import { allMediaTags } from '../media/mediaTags'
import { analysisStore } from '../analysis/analysisStore'
import { projectStore } from '../project/projectStore'
import { analysisSignature, buildMediaSearchDocs, type VisionText } from './searchDocs'
import { searchIndex, searchIndexStore } from './searchIndexStore'

interface MediaText {
  transcript: Transcript | null
  vision: VisionText[]
}

// Text read from main, kept until the item's analysis changes again.
const textByMedia = new Map<string, { analysis: string; text: MediaText }>()
// The signature each media item was last indexed with.
const indexedAs = new Map<string, string>()
let activeFolder: string | null = null
let generation = 0

async function readTranscript(
  api: RendererInvokeApi,
  projectFolder: string,
  mediaId: string
): Promise<Transcript | null> {
  try {
    const result = await api.invoke('analysis:transcript:read', { projectFolder, mediaId })
    return result.ok ? result.data.transcript : null
  } catch {
    return null
  }
}

async function readVision(
  api: RendererInvokeApi,
  projectFolder: string,
  mediaId: string
): Promise<VisionText[]> {
  try {
    const result = await api.invoke('analysis:vision:read', { projectFolder, mediaId })
    return result.ok ? result.data.shots : []
  } catch {
    return []
  }
}

async function loadText(
  api: RendererInvokeApi,
  projectFolder: string,
  mediaId: string,
  record: AnalysisRecord | undefined,
  analysis: string
): Promise<MediaText> {
  const cached = textByMedia.get(mediaId)
  if (cached && cached.analysis === analysis) return cached.text
  const [transcript, vision] = await Promise.all([
    record?.stages.transcript.status === 'done'
      ? readTranscript(api, projectFolder, mediaId)
      : Promise.resolve(null),
    record?.stages.vision.status === 'done'
      ? readVision(api, projectFolder, mediaId)
      : Promise.resolve([])
  ])
  const text = { transcript, vision }
  textByMedia.set(mediaId, { analysis, text })
  return text
}

// The part of a media item's index entry that comes from the project: its tags and its moments.
function projectSignature(ref: MediaRef, project: Project, tagNames: ReadonlyMap<string, string>) {
  const name = (id: string) => tagNames.get(id) ?? id
  const moments = project.moments
    .filter((moment) => moment.mediaId === ref.id)
    .map((moment) => [moment.id, moment.name, moment.inMs, moment.outMs, moment.tags.map(name)])
  return JSON.stringify({
    tags: (ref.tagIds ?? []).map(name),
    durationMs: ref.durationMs,
    moments
  })
}

/** Brings the index up to date with the project and its analysis records. */
export async function syncSearchIndex(
  api: RendererInvokeApi,
  folderPath: string,
  project: Project,
  file: AnalysisFile | undefined
): Promise<void> {
  const run = ++generation
  if (folderPath !== activeFolder) {
    activeFolder = folderPath
    textByMedia.clear()
    indexedAs.clear()
    searchIndexStore.getState().reset(folderPath)
  }

  const tagNames = new Map(allMediaTags(project).map((tag) => [tag.id, tag.name]))
  const ids = new Set(project.media.map((ref) => ref.id))
  let removed = false
  for (const id of [...indexedAs.keys()]) {
    if (ids.has(id)) continue
    searchIndex.removeGroup(id)
    indexedAs.delete(id)
    textByMedia.delete(id)
    removed = true
  }

  const changed = project.media.flatMap((ref) => {
    const record = file?.records[ref.id]
    const analysis = analysisSignature(record)
    const signature = `${analysis}#${projectSignature(ref, project, tagNames)}`
    return indexedAs.get(ref.id) === signature ? [] : [{ ref, record, analysis, signature }]
  })
  if (changed.length === 0) {
    if (removed) searchIndexStore.getState().commit()
    return
  }

  const loaded = await Promise.all(
    changed.map(async (item) => ({
      item,
      text: await loadText(api, folderPath, item.ref.id, item.record, item.analysis)
    }))
  )
  // A newer sync has started, or the project changed: its own results will be applied instead.
  if (run !== generation || folderPath !== activeFolder) return

  for (const { item, text } of loaded) {
    const shots: readonly ShotRange[] = item.record?.shots ?? []
    searchIndex.replaceGroup(
      item.ref.id,
      buildMediaSearchDocs({
        ref: item.ref,
        transcript: text.transcript,
        shots,
        vision: text.vision,
        tagNames,
        moments: project.moments
      })
    )
    indexedAs.set(item.ref.id, item.signature)
  }
  searchIndexStore.getState().commit()
}

/**
 * Re-syncs the index when the open project, its media, tags, moments or analysis records change.
 * Edits to the timeline do not touch any of those, so they do not trigger a sync.
 */
export function watchSearchIndex(api: RendererApi): Unsubscribe {
  let lastFolder: string | undefined
  let lastMedia: unknown
  let lastMoments: unknown
  let lastTags: unknown
  let lastFile: unknown

  const check = () => {
    const current = projectStore.getState().current
    if (!current) return
    const { folderPath, project } = current
    const file = analysisStore.getState().filesByFolder[folderPath]
    if (
      folderPath === lastFolder &&
      project.media === lastMedia &&
      project.moments === lastMoments &&
      project.mediaTags === lastTags &&
      file === lastFile
    ) {
      return
    }
    lastFolder = folderPath
    lastMedia = project.media
    lastMoments = project.moments
    lastTags = project.mediaTags
    lastFile = file
    void syncSearchIndex(api, folderPath, project, file)
  }

  const unsubscribes = [projectStore.subscribe(check), analysisStore.subscribe(check)]
  check()
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
}
