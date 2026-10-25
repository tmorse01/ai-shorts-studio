// Creates the main window: the branded title strip, a hidden start until the first paint, and the
// bounds and maximised state from the last session.
import { BrowserWindow, screen } from 'electron'
import { APP_NAME } from '@shared/app'
import {
  APP_BACKGROUND,
  TITLE_BAR_COLOR,
  TITLE_BAR_HEIGHT,
  TITLE_BAR_SYMBOL_COLOR
} from '@shared/theme'
import {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  fitWindowState,
  type WindowState
} from '@shared/windowState'
import { readWindowStateFile, writeWindowStateFile, writeWindowStateSync } from '../windowStateFile'
import { isE2eMode } from '../e2e/e2eMode'
import { E2E_RENDERER_ARG } from '@shared/e2e/previewHook'

export interface MainWindowOptions {
  preload: string
  /** Set in dev, when the renderer is served by the dev server. */
  rendererUrl: string | undefined
  /** The built renderer page, used when there is no dev server. */
  rendererFile: string
  iconPath: string
  stateFile: string
  isPackaged: boolean
}

// Bounds change many times during a drag. The state is written once the window has settled.
const SAVE_DELAY_MS = 300

export async function createMainWindow(options: MainWindowOptions): Promise<BrowserWindow> {
  const saved = await readWindowStateFile(options.stateFile)
  const fitted = fitWindowState(
    saved,
    screen.getAllDisplays().map((display) => display.workArea)
  )

  const win = new BrowserWindow({
    ...(fitted ? { x: fitted.bounds.x, y: fitted.bounds.y } : {}),
    width: fitted?.bounds.width ?? DEFAULT_WINDOW_SIZE.width,
    height: fitted?.bounds.height ?? DEFAULT_WINDOW_SIZE.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: APP_NAME,
    icon: options.iconPath,
    backgroundColor: APP_BACKGROUND,
    // No native title bar. Windows draws min, max and close over the strip (titleBarOverlay), so
    // Snap Layouts and accessibility keep working.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: TITLE_BAR_COLOR,
      symbolColor: TITLE_BAR_SYMBOL_COLOR,
      height: TITLE_BAR_HEIGHT
    },
    // Shown on ready-to-show, so the window never paints an unstyled frame.
    show: false,
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // E2E runs only. The preload reads this argument. Nothing is added when AISS_E2E is unset.
      additionalArguments: isE2eMode() ? [E2E_RENDERER_ARG] : []
    }
  })

  if (fitted?.maximized) win.maximize()

  // DevTools stay on Ctrl+Shift+I in dev builds. The application menu is removed, so the shortcut
  // no longer comes from the menu.
  if (!options.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        input.control &&
        input.shift &&
        input.key.toLowerCase() === 'i'
      ) {
        event.preventDefault()
        win.webContents.toggleDevTools()
      }
    })
  }

  win.once('ready-to-show', () => win.show())

  let timer: ReturnType<typeof setTimeout> | undefined
  const currentState = (): WindowState => ({
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized()
  })
  const scheduleSave = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!win.isDestroyed()) void writeWindowStateFile(options.stateFile, currentState())
    }, SAVE_DELAY_MS)
  }
  win.on('move', scheduleSave)
  win.on('resize', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('close', () => {
    clearTimeout(timer)
    writeWindowStateSync(options.stateFile, currentState())
  })

  if (options.rendererUrl) {
    void win.loadURL(options.rendererUrl)
  } else {
    void win.loadFile(options.rendererFile)
  }
  return win
}
