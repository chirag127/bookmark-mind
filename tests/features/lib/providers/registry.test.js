import { describe, expect, it } from '@jest/globals'
import {
  PROVIDER_BY_ID,
  PROVIDERS,
  resolveProvider,
  validateCustomProvider,
} from '../../../../extension/lib/providers/registry.js'

describe('providers/registry', () => {
  describe('PROVIDERS catalog', () => {
    it('has 13 built-in providers', () => {
      expect(PROVIDERS.length).toBe(13)
    })

    it('every provider has required fields', () => {
      for (const p of PROVIDERS) {
        expect(p.id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
        expect(p.displayName).toBeTruthy()
        expect(p.baseUrl).toMatch(/^https?:\/\//)
        expect(p.baseUrl).not.toMatch(/\/$/)
        expect(['bearer', 'header', 'query']).toContain(p.authScheme)
        expect(p.defaultModel).toBeTruthy()
        expect(['permanent', 'trial', 'byok', 'localhost']).toContain(p.freeTier)
      }
    })

    it('IDs are unique', () => {
      const ids = PROVIDERS.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('registry is frozen', () => {
      expect(Object.isFrozen(PROVIDERS)).toBe(true)
      expect(Object.isFrozen(PROVIDER_BY_ID)).toBe(true)
    })

    it('includes free permanent providers (no-card rule)', () => {
      const permanent = PROVIDERS.filter((p) => p.freeTier === 'permanent').map((p) => p.id)
      expect(permanent).toEqual(expect.arrayContaining(['groq', 'cerebras', 'gemini']))
    })

    it('includes localhost providers', () => {
      const local = PROVIDERS.filter((p) => p.freeTier === 'localhost').map((p) => p.id)
      expect(local).toEqual(expect.arrayContaining(['ollama', 'lm-studio']))
    })
  })

  describe('resolveProvider', () => {
    it('resolves built-in by ID', () => {
      const p = resolveProvider('groq')
      expect(p?.id).toBe('groq')
      expect(p?.displayName).toBe('Groq')
    })

    it('returns null for unknown ID', () => {
      expect(resolveProvider('nonexistent')).toBeNull()
    })

    it('resolves user custom provider from map', () => {
      const custom = { 'my-proxy': { id: 'my-proxy', displayName: 'My Proxy', baseUrl: 'https://x.example/v1', defaultModel: 'foo' } }
      const p = resolveProvider('my-proxy', custom)
      expect(p?.id).toBe('my-proxy')
      expect(p?.custom).toBe(true)
    })

    it('built-in wins over same-ID custom', () => {
      const custom = { groq: { id: 'groq', displayName: 'FAKE', baseUrl: 'https://fake', defaultModel: 'x' } }
      const p = resolveProvider('groq', custom)
      expect(p?.displayName).toBe('Groq')
    })
  })

  describe('validateCustomProvider', () => {
    const valid = () => ({
      id: 'my-proxy',
      displayName: 'My Proxy',
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'gpt-4o-mini',
      authScheme: 'bearer',
    })

    it('accepts a valid record', () => {
      expect(validateCustomProvider(valid()).ok).toBe(true)
    })

    it('rejects non-object', () => {
      expect(validateCustomProvider(null).ok).toBe(false)
      expect(validateCustomProvider(undefined).ok).toBe(false)
      expect(validateCustomProvider('str').ok).toBe(false)
    })

    it('rejects bad id shapes', () => {
      const p = valid(); p.id = 'X'; expect(validateCustomProvider(p).errors).toContain('id must be kebab-case, 2-64 chars')
      const p2 = valid(); p2.id = ''; expect(validateCustomProvider(p2).ok).toBe(false)
      const p3 = valid(); p3.id = 'a'; expect(validateCustomProvider(p3).errors).toContain('id must be kebab-case, 2-64 chars')
    })

    it('rejects colliding with built-in', () => {
      const p = valid(); p.id = 'groq'
      expect(validateCustomProvider(p).errors).toContain('id "groq" collides with a built-in provider')
    })

    it('rejects bad baseUrl', () => {
      const p = valid(); p.baseUrl = 'ftp://x'
      expect(validateCustomProvider(p).ok).toBe(false)
    })

    it('rejects trailing slash in baseUrl', () => {
      const p = valid(); p.baseUrl = 'https://x.com/v1/'
      expect(validateCustomProvider(p).errors).toContain('baseUrl must not end with /')
    })

    it('requires authHeader when authScheme=header', () => {
      const p = valid(); p.authScheme = 'header'
      expect(validateCustomProvider(p).errors).toContain('authHeader required when authScheme=header')
      p.authHeader = 'x-api-key'
      expect(validateCustomProvider(p).ok).toBe(true)
    })
  })
})
