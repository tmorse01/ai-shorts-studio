// Keeps the Anthropic API key encrypted on this machine. Electron's safeStorage encrypts with the OS
// keychain, so the key is never written in plain text and never goes into a project folder. The
// encrypted bytes live in a file in user data. Tests pass a fake encryptor.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { UserFacingError } from '../errors'

export interface SecretStore {
  /** Whether a secret can be stored safely on this machine. */
  isAvailable: () => boolean
  /** The stored secret, or null when none is saved or it cannot be decrypted. */
  read: () => Promise<string | null>
  write: (secret: string) => Promise<void>
  clear: () => Promise<void>
}

// The part of Electron's safeStorage this module needs.
export interface Encryptor {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

export function createSafeStorageSecretStore(file: string, encryptor: Encryptor): SecretStore {
  return {
    isAvailable: () => encryptor.isEncryptionAvailable(),
    async read() {
      let bytes: Buffer
      try {
        bytes = await readFile(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
      try {
        return encryptor.decryptString(bytes)
      } catch {
        // Saved by another user or machine: the key is unusable here, so the user enters it again.
        return null
      }
    },
    async write(secret) {
      if (!encryptor.isEncryptionAvailable()) {
        throw new UserFacingError(
          'Secure storage is not available on this computer, so the key cannot be saved.'
        )
      }
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      await writeFile(tmp, encryptor.encryptString(secret))
      await rename(tmp, file)
    },
    async clear() {
      await rm(file, { force: true })
    }
  }
}

// Used when no encryptor is passed, for example in tests that do not touch keys. Nothing is saved.
export const unavailableSecretStore: SecretStore = {
  isAvailable: () => false,
  read: async () => null,
  write: async () => {
    throw new UserFacingError(
      'Secure storage is not available on this computer, so the key cannot be saved.'
    )
  },
  clear: async () => undefined
}
