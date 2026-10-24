import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSafeStorageSecretStore, type Encryptor } from '../src/main/ai/secretStore'

// Stands in for Electron's safeStorage. "Encrypts" by reversing the bytes, so the file on disk is not
// the plain key, and a file written with another encryptor cannot be read back.
function fakeEncryptor(available = true): Encryptor {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(plain, 'utf8').reverse(),
    decryptString: (bytes) => {
      const text = Buffer.from(bytes).reverse().toString('utf8')
      if (!text.startsWith('sk-')) throw new Error('bad data')
      return text
    }
  }
}

const KEY = 'sk-ant-test-0000000000000000000000'

describe('secret store', () => {
  it('writes an encrypted file, reads the key back, and clears it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-store-'))
    const file = join(dir, 'ai-key.bin')
    const store = createSafeStorageSecretStore(file, fakeEncryptor())

    expect(await store.read()).toBeNull()
    await store.write(KEY)

    expect(readFileSync(file).toString('utf8')).not.toContain(KEY)
    expect(await store.read()).toBe(KEY)

    await store.clear()
    expect(await store.read()).toBeNull()
  })

  it('refuses to write when secure storage is unavailable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-store-'))
    const store = createSafeStorageSecretStore(join(dir, 'ai-key.bin'), fakeEncryptor(false))

    expect(store.isAvailable()).toBe(false)
    await expect(store.write(KEY)).rejects.toThrow('Secure storage is not available')
  })

  it('treats a key that cannot be decrypted as no key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-store-'))
    const file = join(dir, 'ai-key.bin')
    const store = createSafeStorageSecretStore(file, fakeEncryptor())
    await store.write(KEY)

    const other = createSafeStorageSecretStore(file, {
      ...fakeEncryptor(),
      decryptString: () => {
        throw new Error('saved on another machine')
      }
    })
    expect(await other.read()).toBeNull()
  })
})
