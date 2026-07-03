/**
 * Provider-driven chat orchestrator.
 *
 * Uses the new provider layer (lib/providers/*) to run chat completions
 * against whatever provider(s) the user has enabled. Handles:
 *  - Provider fallback ordering (user-configurable in settings)
 *  - Per-provider RequestQueue (rate limit + retry from aiProcessor.js)
 *  - Model penalty on 429 (5-min cool-off)
 *  - Response text extraction + JSON parsing helpers
 *
 * The old provider-specific paths (Gemini native, Cerebras, Groq via hardcoded URLs)
 * remain in aiProcessor.js for backwards compat but aren't used when
 * `providerKeys` map has entries.
 */
import { fetchChat, testAuth } from '../../lib/providers/adapter.js';
import * as keyStore from '../../lib/providers/keyStore.js';
import {
  getOrFetch as getModelsOrFetch,
  invalidate as invalidateModelsCache
} from '../../lib/providers/modelDiscovery.js';
import { resolveProvider } from '../../lib/providers/registry.js';

const PROVIDER_ORDER_KEY = 'providerOrder'; // string[] of provider IDs in fallback order
const CUSTOM_PROVIDERS_KEY = 'customProviders'; // { id -> provider record }
const MODEL_PICK_KEY = 'providerModelPick'; // { [providerId]: pickedModelId }

const RATE_LIMIT_PENALTY_MS = 5 * 60 * 1000;

export class ChatOrchestrator {
  constructor() {
    /** @type {Map<string, number>} providerId → penalty expiry timestamp */
    this.penalties = new Map();
  }

  async getEnabledProviders() {
    const [customMap, order, providerIds] = await Promise.all([
      chrome.storage.sync.get(CUSTOM_PROVIDERS_KEY).then((r) => r[CUSTOM_PROVIDERS_KEY] || {}),
      chrome.storage.sync.get(PROVIDER_ORDER_KEY).then((r) => r[PROVIDER_ORDER_KEY] || null),
      keyStore.list()
    ]);
    // If order is set, honor it (filter to providers with keys). Else fall back to keyStore order.
    const seen = new Set();
    const ordered = [];
    const source = Array.isArray(order) ? order : providerIds;
    for (const id of source) {
      if (seen.has(id)) continue;
      if (!providerIds.includes(id)) continue; // no key set
      const p = resolveProvider(id, customMap);
      if (!p) continue;
      ordered.push(p);
      seen.add(id);
    }
    // Append any providers with keys not in the order list
    for (const id of providerIds) {
      if (seen.has(id)) continue;
      const p = resolveProvider(id, customMap);
      if (p) ordered.push(p);
    }
    return ordered;
  }

  async getPickedModel(providerId) {
    const { [MODEL_PICK_KEY]: picks } = await chrome.storage.sync.get(MODEL_PICK_KEY);
    return picks?.[providerId] ? picks[providerId] : null;
  }

  async setPickedModel(providerId, modelId) {
    const { [MODEL_PICK_KEY]: picks } = await chrome.storage.sync.get(MODEL_PICK_KEY);
    const next = { ...(picks || {}), [providerId]: modelId };
    await chrome.storage.sync.set({ [MODEL_PICK_KEY]: next });
  }

  isPenalized(providerId) {
    const until = this.penalties.get(providerId);
    if (!until) return false;
    if (Date.now() > until) {
      this.penalties.delete(providerId);
      return false;
    }
    return true;
  }

  penalize(providerId) {
    this.penalties.set(providerId, Date.now() + RATE_LIMIT_PENALTY_MS);
  }

  /**
   * Run a chat completion, trying each enabled provider in order until one succeeds.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [opts] - { temperature, maxTokens, jsonMode, preferProviderId, model }
   * @returns {Promise<{text: string, providerId: string, model: string, usage?: object}>}
   */
  async chat(messages, opts = {}) {
    const providers = await this.getEnabledProviders();
    if (providers.length === 0) {
      throw new Error('No providers configured. Open settings and add a provider + API key.');
    }
    // If preferProviderId is set, move it to front
    let queue = providers;
    if (opts.preferProviderId) {
      const idx = providers.findIndex((p) => p.id === opts.preferProviderId);
      if (idx > 0)
        queue = [providers[idx], ...providers.slice(0, idx), ...providers.slice(idx + 1)];
    }

    /** @type {Error|null} */
    let lastErr = null;
    for (const provider of queue) {
      if (this.isPenalized(provider.id)) {
        console.log(`⏭️ Skipping penalized ${provider.id}`);
        continue;
      }
      const apiKey = await keyStore.get(provider.id);
      if (!apiKey && provider.freeTier !== 'localhost') {
        console.log(`⏭️ Skipping ${provider.id} — no key set`);
        continue;
      }
      const model = opts.model || (await this.getPickedModel(provider.id)) || provider.defaultModel;
      try {
        const t0 = performance.now();
        const res = await fetchChat(provider, {
          model,
          messages,
          apiKey,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          jsonMode: opts.jsonMode
        });
        const latency = Math.round(performance.now() - t0);
        console.log(`✅ ${provider.id}/${model} ${latency}ms`);
        return { text: res.text, providerId: provider.id, model, usage: res.usage, latency };
      } catch (err) {
        lastErr = err;
        console.warn(`⚠️ ${provider.id}/${model} failed: ${err.message}`);
        if (err.status === 429) this.penalize(provider.id);
        // Continue to next provider on transient errors; stop on auth errors
        if (err.status === 401 || err.status === 403) {
          console.warn(`🔒 ${provider.id}: auth error — will not fall through`);
          break;
        }
      }
    }
    throw lastErr || new Error('All configured providers failed or were skipped');
  }

  /**
   * Try to parse LLM output as JSON, tolerating ```json fences.
   */
  parseJsonResponse(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const src = fenced ? fenced[1] : trimmed;
    const arrayMatch = src.match(/\[[\s\S]*\]/);
    const objectMatch = src.match(/\{[\s\S]*\}/);
    const jsonSrc = arrayMatch ? arrayMatch[0] : objectMatch ? objectMatch[0] : src;
    return JSON.parse(jsonSrc);
  }

  /**
   * Convenience: chat + parse JSON.
   */
  async chatJson(messages, opts = {}) {
    const res = await this.chat(messages, { ...opts, jsonMode: true });
    return { ...res, data: this.parseJsonResponse(res.text) };
  }

  /**
   * Refresh model list for a provider (used by settings UI).
   */
  async refreshModels(providerId) {
    const providers = await this.getEnabledProviders();
    const p = providers.find((pp) => pp.id === providerId);
    if (!p) throw new Error(`Provider not found or has no key: ${providerId}`);
    const apiKey = await keyStore.get(providerId);
    await invalidateModelsCache(providerId);
    return getModelsOrFetch(p, apiKey);
  }

  /**
   * Test auth (used by settings "Test" button).
   */
  async testProvider(providerId) {
    const providers = await this.getEnabledProviders();
    const p = providers.find((pp) => pp.id === providerId);
    if (!p) return { ok: false, error: 'Provider not found or no key set' };
    const apiKey = await keyStore.get(providerId);
    return testAuth(p, apiKey);
  }
}

export const chatOrchestrator = new ChatOrchestrator();
