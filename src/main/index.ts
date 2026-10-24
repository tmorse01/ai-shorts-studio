import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '@shared/app'
import { APP_BACKGROUND } from '@shared/theme'
import { registerIpcHandlers } from './ipc/register'
import { createIpcHandlers } from './ipc/handlers'
import { setupErrorReporting } from './errors/setupErrorReporting'

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
  registerIpcHandlers(
    createIpcHandlers({ layoutFile: join(app.getPath('userData'), 'ui-layout.json') })
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
