import { readLayoutFile, writeLayoutFile } from '../layoutFile'
import type { IpcHandlers } from './dispatch'

export interface IpcHandlerOptions {
  /** Where the editor layout is saved. The app passes a file in user data; tests pass a temp file. */
  layoutFile: string
}

// The main-process implementation of every channel. Input is already validated when a handler runs.
export function createIpcHandlers({ layoutFile }: IpcHandlerOptions): IpcHandlers {
  return {
    'app:echo': ({ text }) => ({ text, length: text.length }),
    'ui:layout:load': async () => ({ layout: await readLayoutFile(layoutFile) }),
    'ui:layout:save': async ({ layout }) => {
      await writeLayoutFile(layoutFile, layout)
      return { saved: true }
    }
  }
}
