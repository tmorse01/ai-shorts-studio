// Main-process registry of recently used project folders, kept as one JSON file in user data.
// A missing or damaged file means an empty list, so the dashboard still opens. Entries whose
// project.json is gone are listed as missing, not dropped.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  storedRecentProjectSchema,
  type RecentProject,
  type StoredRecentProject
} from '@shared/project/recentProjects'
import { PROJECT_FILE, type OpenedProject } from './projectStorage'

const THUMBS_DIR = join('cache', 'thumbs')

// Reads the registry. Entries that fail the schema are skipped, the rest are kept.
export async function readRegistry(file: string): Promise<StoredRecentProject[]> {
  let json: unknown
  try {
    json = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return []
  }
  if (!Array.isArray(json)) return []

  return json.flatMap((item) => {
    const parsed = storedRecentProjectSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

// Writes the registry atomically (temp file, then rename), so a crash never leaves half a file.
async function writeRegistry(file: string, entries: StoredRecentProject[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

// Lists the registry, newest first. An entry is missing when its project.json can no longer be
// found at its folder.
export async function listRecentProjects(file: string): Promise<RecentProject[]> {
  const entries = await readRegistry(file)
  const listed = await Promise.all(
    entries.map(async (entry): Promise<RecentProject> => ({
      ...entry,
      missing: !(await isFile(join(entry.folderPath, PROJECT_FILE)))
    }))
  )
  return listed.sort((a, b) => b.lastOpened.localeCompare(a.lastOpened))
}

// The entry for a project as it was just opened or created.
function entryFor(opened: OpenedProject, now: Date): StoredRecentProject {
  return {
    folderPath: opened.folderPath,
    name: opened.project.name,
    lastOpened: now.toISOString(),
    shortCount: opened.project.shorts.length,
    thumbnailPath: join(opened.folderPath, THUMBS_DIR, `${opened.project.id}.jpg`)
  }
}

// Adds a project to the registry, or refreshes its entry if the folder is already listed. Call it
// after a project is created or opened. Renames should call it too, so the name stays current.
export async function recordRecentProject(
  file: string,
  opened: OpenedProject,
  now: Date = new Date()
): Promise<StoredRecentProject> {
  const entry = entryFor(opened, now)
  const others = (await readRegistry(file)).filter((item) => item.folderPath !== entry.folderPath)
  await writeRegistry(file, [...others, entry])
  return entry
}

// Takes a project out of the registry. The project folder itself is not touched.
export async function removeRecentProject(file: string, folderPath: string): Promise<void> {
  const entries = await readRegistry(file)
  const kept = entries.filter((item) => item.folderPath !== folderPath)
  if (kept.length !== entries.length) await writeRegistry(file, kept)
}

// Points an entry at the folder where its project now lives: the old entry is replaced, and the
// project is recorded at the new path as if it had just been opened.
export async function locateRecentProject(
  file: string,
  oldFolderPath: string,
  opened: OpenedProject,
  now: Date = new Date()
): Promise<RecentProject> {
  const entry = entryFor(opened, now)
  const others = (await readRegistry(file)).filter(
    (item) => item.folderPath !== oldFolderPath && item.folderPath !== entry.folderPath
  )
  await writeRegistry(file, [...others, entry])
  return { ...entry, missing: false }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
