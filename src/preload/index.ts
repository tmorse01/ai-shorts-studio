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
  deleteProject: (projectId) => ipcRenderer.invoke(IPC.projectDelete, projectId),
  importMedia: (projectId) => ipcRenderer.invoke(IPC.projectImportMedia, projectId),
  relinkMedia: (projectId) => ipcRenderer.invoke(IPC.projectRelinkMedia, projectId),
  mediaUrl: (projectId) => `shorts-media://project/${projectId}`,
  ensureThumbnails: (projectId) => ipcRenderer.invoke(IPC.thumbsEnsure, projectId),
  thumbnailUrl: (projectId, index) => `shorts-media://thumb/${projectId}/${index}`,

  listShorts: (projectId) => ipcRenderer.invoke(IPC.shortList, projectId),
  createShort: (projectId, segments, title) =>
    ipcRenderer.invoke(IPC.shortCreate, { projectId, segments, title }),
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
  pickMusicFolder: () => ipcRenderer.invoke(IPC.settingsSetMusicFolder),
  listMusic: () => ipcRenderer.invoke(IPC.musicList),
  pickOutputDir: () => ipcRenderer.invoke(IPC.dialogPickOutputDir)
}

contextBridge.exposeInMainWorld('studio', api)
