// Reads and writes the AI state file in user data: the vision model, the monthly cap and the usage
// records. Nothing project-specific goes here, and the key never does. A damaged file is treated as
// empty, so the app still starts. Same atomic write as the analysis file.
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { aiStateFileSchema, emptyAiStateFile, type AiStateFile } from '@shared/ai/aiSettings'

export interface AiStateStorage {
  load: () => Promise<AiStateFile>
  save: (state: AiStateFile) => Promise<void>
}

export function createAiStateFile(file: string): AiStateStorage {
  return {
    async load() {
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyAiStateFile()
        throw error
      }
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        return emptyAiStateFile()
      }
      const parsed = aiStateFileSchema.safeParse(json)
      return parsed.success ? parsed.data : emptyAiStateFile()
    },
    async save(state) {
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
      const text = `${JSON.stringify(aiStateFileSchema.parse(state), null, 2)}\n`
      try {
        const handle = await open(tmp, 'w')
        try {
          await handle.writeFile(text, 'utf8')
          await handle.sync()
        } finally {
          await handle.close()
        }
        await rename(tmp, file)
      } catch (error) {
        await rm(tmp, { force: true })
        throw error
      }
    }
  }
}

/** Storage that keeps nothing on disk. Used by default, so tests and CI never touch user data. */
export function memoryAiStateStorage(initial: AiStateFile = emptyAiStateFile()): AiStateStorage {
  let stored = initial
  return {
    load: async () => stored,
    save: async (state) => {
      stored = state
    }
  }
}
