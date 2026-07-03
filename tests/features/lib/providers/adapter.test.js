import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  buildChatRequest,
  buildModelsRequest,
  normalizeChatResponse,
  normalizeModelsResponse,
} from '../../../../extension/lib/providers/adapter.js'

const groq = {
  id: 'groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  chatPath: '/chat/completions',
  modelsPath: '/models',
  authScheme: 'bearer',
  defaultModel: 'llama-3.3-70b-versatile',
}

const custom = {
  id: 'custom-header',
  baseUrl: 'https://x.example/v1',
  chatPath: '/chat/completions',
  modelsPath: '/models',
  authScheme: 'header',
  authHeader: 'x-api-key',
  defaultModel: 'foo',
}

const query = {
  id: 'q',
  baseUrl: 'https://q.example/v1',
  chatPath: '/chat/completions',
  modelsPath: '/models',
  authScheme: 'query',
  defaultModel: 'bar',
}

describe('providers/adapter', () => {
  describe('buildChatRequest', () => {
    it('builds bearer request', () => {
      const r = buildChatRequest(groq, {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'hi' }],
        apiKey: 'gsk_test',
      })
      expect(r.url).toBe('https://api.groq.com/openai/v1/chat/completions')
      expect(r.headers.Authorization).toBe('Bearer gsk_test')
      expect(r.body).toMatchObject({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'hi' }],
      })
    })

    it('builds custom-header request', () => {
      const r = buildChatRequest(custom, {
        messages: [{ role: 'user', content: 'x' }],
        apiKey: 'abc',
      })
      expect(r.headers['x-api-key']).toBe('abc')
      expect(r.headers.Authorization).toBeUndefined()
    })

    it('builds query-auth request', () => {
      const r = buildChatRequest(query, {
        messages: [{ role: 'user', content: 'x' }],
        apiKey: 'sekret',
      })
      // Query auth is deferred to fetch layer via marker headers
      expect(r.headers['x-bmind-auth-mode']).toBe('query')
      expect(r.headers['x-bmind-auth-value']).toBe('sekret')
    })

    it('sends temperature + max_tokens when set', () => {
      const r = buildChatRequest(groq, { messages: [], apiKey: 'x', temperature: 0.2, maxTokens: 50 })
      expect(r.body.temperature).toBe(0.2)
      expect(r.body.max_tokens).toBe(50)
    })

    it('adds response_format when jsonMode', () => {
      const r = buildChatRequest(groq, { messages: [], apiKey: 'x', jsonMode: true })
      expect(r.body.response_format).toEqual({ type: 'json_object' })
    })

    it('falls back to defaultModel when model omitted', () => {
      const r = buildChatRequest(groq, { messages: [], apiKey: 'x' })
      expect(r.body.model).toBe('llama-3.3-70b-versatile')
    })
  })

  describe('buildModelsRequest', () => {
    it('builds bearer models request', () => {
      const r = buildModelsRequest(groq, 'gsk_test')
      expect(r.url).toBe('https://api.groq.com/openai/v1/models')
      expect(r.headers.Authorization).toBe('Bearer gsk_test')
    })

    it('omits auth for anonymous', () => {
      const r = buildModelsRequest(groq, null)
      expect(r.headers.Authorization).toBeUndefined()
    })
  })

  describe('normalizeChatResponse', () => {
    it('extracts text from OpenAI shape', () => {
      const raw = {
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
        usage: { prompt_tokens: 5 },
      }
      const r = normalizeChatResponse('groq', raw)
      expect(r.text).toBe('hello')
      expect(r.usage.prompt_tokens).toBe(5)
    })

    it('handles empty choices', () => {
      expect(normalizeChatResponse('x', {}).text).toBe('')
      expect(normalizeChatResponse('x', { choices: [] }).text).toBe('')
    })
  })

  describe('normalizeModelsResponse', () => {
    it('extracts data[].id', () => {
      const r = normalizeModelsResponse('groq', { data: [{ id: 'a' }, { id: 'b' }] })
      expect(r).toEqual(['a', 'b'])
    })

    it('extracts models[]', () => {
      const r = normalizeModelsResponse('x', { models: [{ name: 'foo' }, 'bar'] })
      expect(r).toEqual(['foo', 'bar'])
    })

    it('empty on null', () => {
      expect(normalizeModelsResponse('x', null)).toEqual([])
      expect(normalizeModelsResponse('x', {})).toEqual([])
    })
  })
})
