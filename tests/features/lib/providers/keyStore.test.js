import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// Reset modules between tests to reload the mocked crypto/chrome per test
async function loadKeyStore() {
  jest.resetModules()
  const mod = await import('../../../../extension/lib/providers/keyStore.js')
  return mod
}

const mockChromeStorage = () => {
  const local = new Map()
  const sync = new Map()
  return {
    local: {
      get: jest.fn(async (keyOrKeys) => {
        if (typeof keyOrKeys === 'string') return local.has(keyOrKeys) ? { [keyOrKeys]: local.get(keyOrKeys) } : {}
        if (Array.isArray(keyOrKeys)) {
          const out = {}
          for (const k of keyOrKeys) if (local.has(k)) out[k] = local.get(k)
          return out
        }
        return {}
      }),
      set: jest.fn(async (obj) => { for (const [k, v] of Object.entries(obj)) local.set(k, v) }),
      remove: jest.fn(async (keys) => { for (const k of [].concat(keys)) local.delete(k) }),
    },
    sync: {
      get: jest.fn(async (keyOrKeys) => {
        if (typeof keyOrKeys === 'string') return sync.has(keyOrKeys) ? { [keyOrKeys]: sync.get(keyOrKeys) } : {}
        if (Array.isArray(keyOrKeys)) {
          const out = {}
          for (const k of keyOrKeys) if (sync.has(k)) out[k] = sync.get(k)
          return out
        }
        return {}
      }),
      set: jest.fn(async (obj) => { for (const [k, v] of Object.entries(obj)) sync.set(k, v) }),
      remove: jest.fn(async (keys) => { for (const k of [].concat(keys)) sync.delete(k) }),
    },
    _local: local,
    _sync: sync,
  }
}

describe('providers/keyStore', () => {
  beforeEach(() => {
    globalThis.chrome = { storage: mockChromeStorage() }
    // node's crypto.subtle is available in Node 22 globally
  })

  it('set → get round-trip returns plaintext', async () => {
    const ks = await loadKeyStore()
    await ks.set('groq', 'gsk_secret_123')
    expect(await ks.get('groq')).toBe('gsk_secret_123')
  })

  it('stored value is NOT plaintext', async () => {
    const ks = await loadKeyStore()
    await ks.set('groq', 'gsk_secret_123')
    const stored = globalThis.chrome.storage._sync.get('providerKeys')
    const storedJson = JSON.stringify(stored)
    expect(storedJson).not.toContain('gsk_secret_123')
    expect(stored.groq).toHaveProperty('iv')
    expect(stored.groq).toHaveProperty('ct')
  })

  it('remove clears entry', async () => {
    const ks = await loadKeyStore()
    await ks.set('groq', 'k1')
    await ks.remove('groq')
    expect(await ks.get('groq')).toBeNull()
  })

  it('list returns only providers with keys', async () => {
    const ks = await loadKeyStore()
    await ks.set('groq', 'k1')
    await ks.set('cerebras', 'k2')
    const ids = await ks.list()
    expect(ids.sort()).toEqual(['cerebras', 'groq'])
  })

  it('set rejects empty plaintext', async () => {
    const ks = await loadKeyStore()
    await expect(ks.set('groq', '')).rejects.toThrow()
    await expect(ks.set('groq', 0)).rejects.toThrow()
  })

  it('migrateLegacy moves legacy keys and clears them', async () => {
    globalThis.chrome.storage._sync.set('geminiApiKey', 'legacy_gem')
    globalThis.chrome.storage._sync.set('groqApiKey', 'legacy_groq')

    const ks = await loadKeyStore()
    const result = await ks.migrateLegacy()

    expect(result.migrated.sort()).toEqual(['gemini', 'groq'])
    expect(await ks.get('gemini')).toBe('legacy_gem')
    expect(await ks.get('groq')).toBe('legacy_groq')
    expect(globalThis.chrome.storage._sync.get('geminiApiKey')).toBeUndefined()
    expect(globalThis.chrome.storage._sync.get('groqApiKey')).toBeUndefined()
    expect(globalThis.chrome.storage._sync.get('providersMigrated')).toBe('1.1.0')
  })

  it('migrateLegacy is idempotent', async () => {
    globalThis.chrome.storage._sync.set('providersMigrated', '1.1.0')
    globalThis.chrome.storage._sync.set('geminiApiKey', 'should_not_migrate')

    const ks = await loadKeyStore()
    const result = await ks.migrateLegacy()

    expect(result.migrated).toEqual([])
    expect(await ks.get('gemini')).toBeNull()
    // legacy key remains untouched (migration did not run)
    expect(globalThis.chrome.storage._sync.get('geminiApiKey')).toBe('should_not_migrate')
  })
})
