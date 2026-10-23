import { contextBridge, ipcRenderer } from 'electron'
import type { StudioApi } from '../shared/api'
import { IPC, type Job } from '../shared/types'

/**
 * Narrow, typed bridge. Each function maps to one fixed channel. There is deliberately no generic
 * invoke(channel, ...args), so the renderer cannot reach channels or Node APIs it was not given.
 */
const api: StudioApi = {
  listProjects: () => ipcRenderer.invoke(IPC.projectList),
  createProject: (name) => ipcRenderer.invoke(IPC.projectCreate, { name }),
  renameProject: (projectId, name) => ipcRenderer.invoke(IPC.projectUpdate, { id: projectId, patch: { name } }),
  deleteProject: (projectId) => ipcRenderer.invoke(IPC.projectDelete, projectId),

  importMedia: (projectId) => ipcRenderer.invoke(IPC.mediaImport, projectId),
  relinkMedia: (assetId) => ipcRenderer.invoke(IPC.mediaRelink, assetId),
  removeMedia: (assetId) => ipcRenderer.invoke(IPC.mediaRemove, assetId),
  prepareMedia: (assetId) => ipcRenderer.invoke(IPC.mediaPrepare, assetId),
  mediaUrl: (assetId) => `shorts-media://media/${assetId}`,
  ensurePosters: async (projectId) => {
    await ipcRenderer.invoke(IPC.mediaPosters, projectId)
  },
  posterUrl: (assetId) => `shorts-media://poster/${assetId}`,
  clipFrameUrl: (shortId, version = '') => `shorts-media://clip/${shortId}?v=${encodeURIComponent(version)}`,
  ensureThumbnails: (assetId) => ipcRenderer.invoke(IPC.thumbsEnsure, assetId),
  thumbnailUrl: (assetId, index) => `shorts-media://thumb/${assetId}/${index}`,
  shortAudioUrl: (shortId, kind, version = '') => `shorts-media://audio/${shortId}/${kind}?v=${encodeURIComponent(version)}`,

  listShorts: (projectId) => ipcRenderer.invoke(IPC.shortList, projectId),
  createShort: (projectId, sourceId, segments, title) =>
    ipcRenderer.invoke(IPC.shortCreate, { projectId, sourceId, segments, title }),
  updateShort: (shortId, patch) => ipcRenderer.invoke(IPC.shortUpdate, { id: shortId, patch }),
  deleteShort: (shortId) => ipcRenderer.invoke(IPC.shortDelete, shortId),
  saveNarration: (projectId, shortId, audio) =>
    ipcRenderer.invoke(IPC.shortNarrate, { projectId, shortId, audio }),
  clearNarration: (projectId, shortId) => ipcRenderer.invoke(IPC.shortClearNarration, { projectId, shortId }),

  startAnalysis: (req) => ipcRenderer.invoke(IPC.analysisStart, req),
  startExport: (req) => ipcRenderer.invoke(IPC.exportStart, req),
  cancelJob: (jobId) => ipcRenderer.invoke(IPC.exportCancel, jobId),
  revealExport: (shortId) => ipcRenderer.invoke(IPC.exportReveal, shortId),
  openExport: (shortId) => ipcRenderer.invoke(IPC.exportOpen, shortId),
  listJobs: (projectId) => ipcRenderer.invoke(IPC.jobList, projectId),
  onJobUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, job: Job): void => callback(job)
    ipcRenderer.on('job:update', listener)
    return () => ipcRenderer.removeListener('job:update', listener)
  },

  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setApiKey: (key) => ipcRenderer.invoke(IPC.settingsSetApiKey, { key }),
  clearApiKey: () => ipcRenderer.invoke(IPC.settingsClearApiKey),
  pickOutputDir: () => ipcRenderer.invoke(IPC.dialogPickOutputDir)
}

contextBridge.exposeInMainWorld('studio', api)
