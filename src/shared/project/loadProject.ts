// Turns the parsed contents of project.json into a validated Project, upgrading old versions first.
// Pure: no file access. The storage service (#30) reads the file, calls this, and decides what to
// write back. When `migrated` is true the storage service should first copy the original file to a
// backup, then write the upgraded project.
import { CURRENT_SCHEMA_VERSION, projectSchema, type Project } from './schema'
import { projectMigrations, type ProjectMigration } from './migrations'

export const PROJECT_ERROR_CODES = [
  'INVALID_JSON',
  'INVALID_PROJECT',
  'UNSUPPORTED_VERSION',
  'MIGRATION_MISSING',
  'MIGRATION_FAILED'
] as const
export type ProjectErrorCode = (typeof PROJECT_ERROR_CODES)[number]

// `message` is plain language and safe to show to the user.
export type ProjectError = { code: ProjectErrorCode; message: string }

export type ProjectResult<T> = { ok: true; value: T } | { ok: false; error: ProjectError }

export type MigrateOptions = {
  currentVersion: number
  migrations: readonly ProjectMigration[]
}

export type MigratedData = {
  data: unknown
  fromVersion: number
  toVersion: number
}

export type LoadedProject = {
  project: Project
  // True when the file was on an older schema version and was upgraded in memory.
  migrated: boolean
  fromVersion: number
  toVersion: number
}

const MAX_ISSUES_SHOWN = 5

// Applies migrations in order, from the file's version up to `currentVersion`. Does not validate
// the result against a schema; that is the caller's job.
export function migrateToVersion(
  input: unknown,
  { currentVersion, migrations }: MigrateOptions
): ProjectResult<MigratedData> {
  if (!isRecord(input)) {
    return fail('INVALID_PROJECT', 'The project file must contain a JSON object.')
  }
  const version = input.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('INVALID_PROJECT', 'The project file has no valid "schemaVersion".')
  }
  if (version > currentVersion) {
    return fail(
      'UNSUPPORTED_VERSION',
      `This project was saved by a newer version of AI Shorts Studio (project format ${version}, ` +
        `this app reads up to ${currentVersion}). Update the app to open it.`
    )
  }

  let data: unknown = input
  let at = version
  while (at < currentVersion) {
    const step = migrations.find((migration) => migration.from === at)
    if (!step || step.to <= step.from) {
      return fail(
        'MIGRATION_MISSING',
        `No upgrade is available from project format ${at} to ${currentVersion}.`
      )
    }
    try {
      data = step.up(data)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error'
      return fail(
        'MIGRATION_FAILED',
        `The project could not be upgraded from format ${step.from} to ${step.to}: ${reason}.`
      )
    }
    at = step.to
  }

  return { ok: true, value: { data, fromVersion: version, toVersion: at } }
}

// Loads already-parsed project.json data: migrates it, then validates it with zod.
export function loadProject(
  input: unknown,
  options: MigrateOptions = {
    currentVersion: CURRENT_SCHEMA_VERSION,
    migrations: projectMigrations
  }
): ProjectResult<LoadedProject> {
  const upgraded = migrateToVersion(input, options)
  if (!upgraded.ok) return upgraded

  const parsed = projectSchema.safeParse(upgraded.value.data)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => {
      const where = issue.path.length > 0 ? issue.path.map(String).join('.') : 'project'
      return `${where}: ${issue.message}`
    })
    const more = parsed.error.issues.length - issues.length
    const suffix = more > 0 ? `\n...and ${more} more` : ''
    return fail('INVALID_PROJECT', `The project file is invalid.\n${issues.join('\n')}${suffix}`)
  }

  return {
    ok: true,
    value: {
      project: parsed.data,
      migrated: upgraded.value.fromVersion !== upgraded.value.toVersion,
      fromVersion: upgraded.value.fromVersion,
      toVersion: upgraded.value.toVersion
    }
  }
}

// Convenience for the storage service: parse the file's text, then load it.
export function loadProjectText(text: string): ProjectResult<LoadedProject> {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    return fail('INVALID_JSON', `The project file is not valid JSON (${reason}).`)
  }
  return loadProject(input)
}

function fail<T = never>(code: ProjectErrorCode, message: string): ProjectResult<T> {
  return { ok: false, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
