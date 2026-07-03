/**
 * Provider Adapter
 *
 * Uniform request builder + response normalizer across all OpenAI-compat
 * providers (and the small quirks each needs). No provider-specific code
 * paths outside this file — the rest of the extension deals in provider
 * IDs and this adapter handles the wire format.
 *
 * Public surface:
 *   buildChatRequest({ provider, model, messages, apiKey, temperature, maxTokens, jsonMode }) → { url, headers, body }
 *   normalizeChatResponse(providerId, raw) → { text, usage?, raw }
 *   buildModelsRequest({ provider, apiKey }) → { url, headers }
 *   normalizeModelsResponse(providerId, raw) → string[]  (model IDs)
 *   fetchChat(providerCtx, {messages, model, ...opts}) → Promise<{text, usage}>
 *   testAuth(providerCtx) → Promise<{ok, error?, sampleModels?: string[]}>
 */

/**
 * Build a chat/completions request for the given provider.
 * @param {object} p - resolved provider record from registry
 * @param {object} opts - { model, messages, apiKey, temperature, maxTokens, jsonMode }
 */
export function buildChatRequest(p, { model, messages, apiKey, temperature, maxTokens, jsonMode }) {
  const url = `${p.baseUrl}${p.chatPath || '/chat/completions'}`;
  const headers = { 'Content-Type': 'application/json' };
  applyAuth(headers, p, apiKey);

  /** @type {any} */
  const body = {
    model: model || p.defaultModel,
    messages
  };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (typeof maxTokens === 'number') body.max_tokens = maxTokens;
  if (jsonMode) {
    // OpenAI-compat JSON mode: response_format is widely supported but not universally.
    body.response_format = { type: 'json_object' };
  }

  return { url, headers, body };
}

export function buildModelsRequest(p, apiKey) {
  const url = `${p.baseUrl}${p.modelsPath || '/models'}`;
  const headers = {};
  applyAuth(headers, p, apiKey);
  return { url, headers };
}

function applyAuth(headers, p, apiKey) {
  if (!apiKey) return; // localhost providers may accept anonymous
  const scheme = p.authScheme || 'bearer';
  if (scheme === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
    return;
  }
  if (scheme === 'header') {
    const name = p.authHeader || 'Authorization';
    const prefix = p.authPrefix || '';
    headers[name] = `${prefix}${apiKey}`;
    return;
  }
  if (scheme === 'query') {
    // handled at call sites — return a marker so callers know to append
    headers['x-bmind-auth-mode'] = 'query';
    headers['x-bmind-auth-value'] = apiKey;
  }
}

/**
 * Normalize a chat response into { text, usage?, raw }.
 * All shipped providers return OpenAI shape. Left as extension point.
 */
export function normalizeChatResponse(_providerId, raw) {
  if (!raw || !Array.isArray(raw.choices) || raw.choices.length === 0) {
    return { text: '', usage: raw?.usage, raw };
  }
  const choice = raw.choices[0];
  const text = choice?.message?.content ?? choice?.text ?? '';
  return { text, usage: raw.usage, raw };
}

/**
 * Normalize a /models list to a plain array of string IDs.
 */
export function normalizeModelsResponse(_providerId, raw) {
  if (!raw) return [];
  const list = raw.data || raw.models || raw;
  if (!Array.isArray(list)) return [];
  return list
    .map((m) => (typeof m === 'string' ? m : m.id || m.name || m.model || null))
    .filter(Boolean);
}

/**
 * High-level fetch — builds request, applies query-auth if needed, awaits fetch, normalizes.
 * @param {object} p - resolved provider record
 * @param {object} opts - see buildChatRequest
 * @returns {Promise<{text: string, usage?: object, raw: object}>}
 */
export async function fetchChat(p, opts) {
  const { url: baseUrl, headers, body } = buildChatRequest(p, opts);
  let url = baseUrl;
  if (headers['x-bmind-auth-mode'] === 'query') {
    const key = headers['x-bmind-auth-value'];
    url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
    headers['x-bmind-auth-mode'] = undefined;
    headers['x-bmind-auth-value'] = undefined;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(
      `${p.displayName || p.id} chat: ${res.status} ${res.statusText}${errText ? ` — ${errText.slice(0, 240)}` : ''}`
    );
    err.status = res.status;
    err.provider = p.id;
    throw err;
  }
  const raw = await res.json();
  return normalizeChatResponse(p.id, raw);
}

/**
 * Fetch /models for a provider. Returns list of model IDs.
 */
export async function fetchModels(p, apiKey) {
  const { url: baseUrl, headers } = buildModelsRequest(p, apiKey);
  let url = baseUrl;
  if (headers['x-bmind-auth-mode'] === 'query') {
    const key = headers['x-bmind-auth-value'];
    url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
    headers['x-bmind-auth-mode'] = undefined;
    headers['x-bmind-auth-value'] = undefined;
  }
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const err = new Error(`${p.displayName || p.id} models: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.provider = p.id;
    throw err;
  }
  const raw = await res.json();
  return normalizeModelsResponse(p.id, raw);
}

/**
 * Test that a provider + key can authenticate. Uses /models GET if available,
 * else a minimal 1-token chat. Returns { ok, error?, sampleModels? }.
 */
export async function testAuth(p, apiKey) {
  try {
    const models = await fetchModels(p, apiKey);
    return { ok: true, sampleModels: models.slice(0, 20) };
  } catch (modelsErr) {
    // Fallback: minimal chat call
    try {
      await fetchChat(p, {
        model: p.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
        apiKey,
        maxTokens: 1
      });
      return { ok: true, sampleModels: [] };
    } catch (chatErr) {
      return { ok: false, error: chatErr.message || modelsErr.message };
    }
  }
}
