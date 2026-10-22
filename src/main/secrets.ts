import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'

/**
 * Anthropic key encrypted with OS-backed safeStorage (DPAPI on Windows). Protection is only as
 * strong as the Windows account it is bound to, so the UI says so. Never logged, never sent to
 * the renderer after it is saved.
 */
export class SecretStore {
  private readonly file: string

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'anthropic-key.bin')
  }

  available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  has(): boolean {
    return existsSync(this.file)
  }

  save(key: string): void {
    if (!this.available()) throw new Error('OS secure storage is unavailable, so the key cannot be saved safely.')
    writeFileSync(this.file, safeStorage.encryptString(key))
  }

  read(): string | null {
    if (!this.has() || !this.available()) return null
    return safeStorage.decryptString(readFileSync(this.file))
  }

  clear(): void {
    rmSync(this.file, { force: true })
  }
}
