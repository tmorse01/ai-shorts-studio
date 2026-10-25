import { app, BrowserWindow, dialog, Menu, protocol, safeStorage, shell } from 'electron'
import { AiService } from './ai/aiService'
import { createAiStateFile } from './ai/aiStateFile'
import { createSafeStorageSecretStore } from './ai/secretStore'
import { createAnthropicClient } from './ai/anthropicClient'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { APP_USER_MODEL_ID } from '@shared/app'
import { createMainWindow } from './window/mainWindow'
import { MEDIA_SCHEME } from '@shared/media/previewSource'
import { registerIpcHandlers } from './ipc/register'
import { createIpcHandlers } from './ipc/handlers'
import { emitIpcEvent } from './ipc/events'
import { createMediaJobs } from './media/createMediaJobs'
import { MediaSourceRegistry } from './media/mediaSources'
import { serveMediaRequest } from './media/mediaProtocol'
import { setupErrorReporting } from './errors/setupErrorReporting'
import { detectEncoder, unknownEncoder } from './export/encoderDetection'
import { resolveBinary, type BinaryLocation } from './media/binaries'
import type { EncoderInfo } from '@shared/export/exportSettings'
import { isE2eMode, isolatedProfile, readDialogPicks } from './e2e/e2eMode'
import { withForcedHardwareEncoder } from './e2e/forcedEncoderFailure'
import { createFakeAnthropicClient } from './e2e/fakes'

// A test can give the app its own profile and documents folder through AISS_USER_DATA. This must run
// before anything reads those paths.
const profile = isolatedProfile()
if (profile) {
  app.setPath('userData', profile.userData)
  app.setPath('documents', profile.documents)
}

// Windows groups the taskbar button and notifications under the brand, not Electron.
app.setAppUserModelId(APP_USER_MODEL_ID)
// The window has its own title strip, so the default File/Edit/View menu is removed.
Menu.setApplicationMenu(null)

// Footage reaches the preview through this scheme, never through file://. It must be declared as
// privileged before the app is ready. `stream` lets the video element seek with byte ranges.
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function openMainWindow(): void {
  void createMainWindow({
    preload: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
    // Packaged builds read the icon from resources (see extraResources in package.json).
    iconPath: app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(app.getAppPath(), 'build', 'icon.png'),
    stateFile: join(app.getPath('userData'), 'window-state.json'),
    isPackaged: app.isPackaged
  })
}

void app.whenReady().then(async () => {
  setupErrorReporting()
  // The AI state is loaded before any request is served, so the vision gate can answer at once. The
  // key is encrypted by safeStorage (the OS keychain) and stays in user data, never in a project.
  const ai = new AiService({
    secrets: createSafeStorageSecretStore(join(app.getPath('userData'), 'ai-key.bin'), safeStorage),
    // The text-to-speech key is encrypted the same way, in its own file.
    speechSecrets: createSafeStorageSecretStore(
      join(app.getPath('userData'), 'speech-key.bin'),
      safeStorage
    ),
    state: createAiStateFile(join(app.getPath('userData'), 'ai-state.json')),
    createClient: (apiKey) =>
      isE2eMode() ? createFakeAnthropicClient() : createAnthropicClient({ apiKey }),
    onChange: (status) => emitIpcEvent('ai:changed', { status })
  })
  await ai.ready()
  // The job queue lives here in main, so jobs keep running when the renderer reloads.
  const jobs = createMediaJobs(ai)
  jobs.subscribe((job) => emitIpcEvent('media:job:changed', job))
  const mediaSources = new MediaSourceRegistry()
  protocol.handle(MEDIA_SCHEME, (request) => serveMediaRequest(request, mediaSources))
  // The encoder is found in the background, so the window does not wait for FFmpeg to start.
  let exportEncoder: EncoderInfo | null = null
  const binaryLocation: BinaryLocation = {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  }
  void (async () => {
    try {
      exportEncoder = withForcedHardwareEncoder(
        await detectEncoder(resolveBinary('ffmpeg', binaryLocation))
      )
    } catch {
      exportEncoder = unknownEncoder()
    }
  })()
  registerIpcHandlers(
    createIpcHandlers({
      layoutFile: join(app.getPath('userData'), 'ui-layout.json'),
      recentFile: join(app.getPath('userData'), 'recent-projects.json'),
      exportSettingsFile: join(app.getPath('userData'), 'export-settings.json'),
      exportEncoder: () => exportEncoder,
      jobs,
      ai,
      onAnalysisChanged: (change) => emitIpcEvent('analysis:changed', change),
      onBatchChanged: (projectFolder, batch) =>
        emitIpcEvent('batch:changed', { projectFolder, batch }),
      onRenderQueueChanged: (jobs) => emitIpcEvent('export:queue:changed', { jobs }),
      onShortExported: (event) => emitIpcEvent('export:shortExported', event),
      mediaSources,
      system: {
        pickFolder: async () => {
          if (isE2eMode()) return readDialogPicks(app.getPath('userData')).folder
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
          })
          return result.canceled ? null : (result.filePaths[0] ?? null)
        },
        revealFolder: (folderPath) => shell.showItemInFolder(folderPath),
        trashFolder: (folderPath) => shell.trashItem(folderPath),
        documentsDir: () => app.getPath('documents'),
        pickMediaFiles: async () => {
          if (isE2eMode()) return readDialogPicks(app.getPath('userData')).media
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
        },
        saveSrtFile: async ({ suggestedName, text }) => {
          const result = await dialog.showSaveDialog({
            defaultPath: join(app.getPath('documents'), suggestedName),
            filters: [{ name: 'SubRip subtitles', extensions: ['srt'] }]
          })
          if (result.canceled || !result.filePath) return null
          await writeFile(result.filePath, text, 'utf8')
          return result.filePath
        }
      }
    })
  )
  openMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
