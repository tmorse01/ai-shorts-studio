import { app, BrowserWindow, dialog, protocol, shell } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '@shared/app'
import { APP_BACKGROUND } from '@shared/theme'
import { MEDIA_SCHEME } from '@shared/media/previewSource'
import { registerIpcHandlers } from './ipc/register'
import { createIpcHandlers } from './ipc/handlers'
import { emitIpcEvent } from './ipc/events'
import { createMediaJobs } from './media/createMediaJobs'
import { MediaSourceRegistry } from './media/mediaSources'
import { serveMediaRequest } from './media/mediaProtocol'
import { setupErrorReporting } from './errors/setupErrorReporting'

// Footage reaches the preview through this scheme, never through file://. It must be declared as
// privileged before the app is ready. `stream` lets the video element seek with byte ranges.
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: APP_BACKGROUND,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  setupErrorReporting()
  // The job queue lives here in main, so jobs keep running when the renderer reloads.
  const jobs = createMediaJobs()
  jobs.subscribe((job) => emitIpcEvent('media:job:changed', job))
  const mediaSources = new MediaSourceRegistry()
  protocol.handle(MEDIA_SCHEME, (request) => serveMediaRequest(request, mediaSources))
  registerIpcHandlers(
    createIpcHandlers({
      layoutFile: join(app.getPath('userData'), 'ui-layout.json'),
      recentFile: join(app.getPath('userData'), 'recent-projects.json'),
      jobs,
      onAnalysisChanged: (change) => emitIpcEvent('analysis:changed', change),
      mediaSources,
      system: {
        pickFolder: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
          })
          return result.canceled ? null : (result.filePaths[0] ?? null)
        },
        revealFolder: (folderPath) => shell.showItemInFolder(folderPath),
        trashFolder: (folderPath) => shell.trashItem(folderPath),
        documentsDir: () => app.getPath('documents'),
        pickMediaFiles: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
              {
                name: 'Video, audio and images',
                extensions: [
                  'mp4',
                  'mov',
                  'mkv',
                  'webm',
                  'm4v',
                  'avi',
                  'mp3',
                  'wav',
                  'm4a',
                  'aac',
                  'flac',
                  'ogg',
                  'jpg',
                  'jpeg',
                  'png',
                  'webp',
                  'bmp',
                  'gif'
                ]
              }
            ]
          })
          return result.canceled ? [] : result.filePaths
        }
      }
    })
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
