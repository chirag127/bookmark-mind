/**
 * Provider Registry
 *
 * Catalog of OpenAI-compatible LLM providers supported out of the box.
 * Data verified against provider docs 2026-07-03. See docs/PROVIDERS.md.
 *
 * Each entry:
 *  - id:            kebab-case slug (stable, used as key in chrome.storage)
 *  - displayName:   human label (shown in UI)
 *  - baseUrl:       root URL for OpenAI-compat endpoints (no trailing slash)
 *  - chatPath:      path appended for chat completions (default /chat/completions)
 *  - modelsPath:    path for model discovery (default /models)
 *  - authScheme:    'bearer' (Authorization: Bearer $KEY), 'header' (custom header), or 'query'
 *  - authHeader:    header name when authScheme === 'header' (e.g. 'x-goog-api-key')
 *  - authPrefix:    prefix for header value (default '' for bearer, 'Bearer ' concatenation is automatic)
 *  - defaultModel:  fallback model when discovery hasn't populated cache
 *  - freeTier:      short label: 'permanent' | 'trial' | 'byok' | 'localhost'
 *  - freeNotes:     one-liner for tooltip
 *  - homepage:      link for the "get API key" button
 *  - custom:        true if user-added (never in registry, but the type is here for reference)
 */

export const PROVIDERS = Object.freeze([
  {
    id: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'llama-3.3-70b-versatile',
    freeTier: 'permanent',
    freeNotes: '30 RPM, 500K tokens/day. No card. Fastest inference in fleet.',
    homepage: 'https://console.groq.com/keys'
  },
  {
    id: 'cerebras',
    displayName: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'llama-3.3-70b',
    freeTier: 'permanent',
    freeNotes: '1M tokens/day, 30 RPM, no card. 8K context cap on free tier.',
    homepage: 'https://cloud.cerebras.ai/'
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'gemini-2.5-flash',
    freeTier: 'permanent',
    freeNotes: 'Free tier, no card. Not available in EU/UK/CH. Prompts train models.',
    homepage: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    freeTier: 'permanent',
    freeNotes: 'Aggregator. 20+ :free models. 20 RPM / 50 RPD free, 1K RPD with $10 credit.',
    homepage: 'https://openrouter.ai/keys'
  },
  {
    id: 'mistral',
    displayName: 'Mistral (Experiment)',
    baseUrl: 'https://api.mistral.ai/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'mistral-small-latest',
    freeTier: 'permanent',
    freeNotes: 'Experiment plan: 1 RPS, 500K TPM. Prompts train Mistral unless opted out.',
    homepage: 'https://console.mistral.ai/api-keys'
  },
  {
    id: 'huggingface',
    displayName: 'HuggingFace Router',
    baseUrl: 'https://router.huggingface.co/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    freeTier: 'permanent',
    freeNotes: 'Free tier included with HF account. Cold starts can be 30s+.',
    homepage: 'https://huggingface.co/settings/tokens'
  },
  {
    id: 'novita',
    displayName: 'Novita',
    baseUrl: 'https://api.novita.ai/v3/openai',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct',
    freeTier: 'trial',
    freeNotes: '$0.50 signup credits, 60 RPM. 120+ models.',
    homepage: 'https://novita.ai/settings/key-management'
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'deepseek-chat',
    freeTier: 'trial',
    freeNotes: '5M tokens on signup, 30 days. Card required past trial.',
    homepage: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'gpt-4o-mini',
    freeTier: 'trial',
    freeNotes: 'Trial credits inconsistent by region. Card required past trial.',
    homepage: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'lm-studio',
    displayName: 'LM Studio (localhost)',
    baseUrl: 'http://localhost:1234/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'local-model',
    freeTier: 'localhost',
    freeNotes: 'Runs local models. Start LM Studio server first. No key needed.',
    homepage: 'https://lmstudio.ai/'
  },
  {
    id: 'ollama',
    displayName: 'Ollama (localhost)',
    baseUrl: 'http://localhost:11434/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'llama3.2',
    freeTier: 'localhost',
    freeNotes: 'Local models via Ollama. Set OLLAMA_ORIGINS=chrome-extension://* env var.',
    homepage: 'https://ollama.com/'
  },
  {
    id: 'litellm',
    displayName: 'LiteLLM Proxy',
    baseUrl: 'http://localhost:4000/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'gpt-4o-mini',
    freeTier: 'byok',
    freeNotes: 'Route to any provider via self-hosted LiteLLM proxy. Edit baseUrl.',
    homepage: 'https://docs.litellm.ai/docs/proxy/quick_start'
  },
  {
    id: 'omniroute',
    displayName: 'OmniRoute (localhost)',
    baseUrl: 'http://localhost:20128/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    authScheme: 'bearer',
    defaultModel: 'auto/best-coding',
    freeTier: 'localhost',
    freeNotes: '60+ free models routed via local OmniRoute dev server. No key needed.',
    homepage: 'https://github.com/chirag127/OmniRoute'
  }
]);

export const PROVIDER_BY_ID = Object.freeze(Object.fromEntries(PROVIDERS.map((p) => [p.id, p])));

/**
 * Resolve a provider (built-in or user-added custom).
 * Custom providers live in chrome.storage.sync under key `customProviders`.
 * @param {string} id
 * @param {object} [customProvidersMap] - optional { id -> provider } map from storage
 * @returns {object|null} provider record, or null if not found
 */
export function resolveProvider(id, customProvidersMap = null) {
  if (PROVIDER_BY_ID[id]) return PROVIDER_BY_ID[id];
  if (customProvidersMap?.[id]) {
    return { ...customProvidersMap[id], custom: true };
  }
  return null;
}

/**
 * Validate a user-supplied custom provider record. Returns { ok, errors }.
 */
export function validateCustomProvider(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return { ok: false, errors: ['not an object'] };
  if (!p.id || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(p.id))
    errors.push('id must be kebab-case, 2-64 chars');
  if (PROVIDER_BY_ID[p.id]) errors.push(`id "${p.id}" collides with a built-in provider`);
  if (!p.displayName || typeof p.displayName !== 'string') errors.push('displayName required');
  if (!p.baseUrl || !/^https?:\/\//.test(p.baseUrl)) errors.push('baseUrl must be http(s)://…');
  if (p.baseUrl?.endsWith('/')) errors.push('baseUrl must not end with /');
  if (p.authScheme && !['bearer', 'header', 'query'].includes(p.authScheme))
    errors.push('authScheme must be bearer|header|query');
  if (p.authScheme === 'header' && !p.authHeader)
    errors.push('authHeader required when authScheme=header');
  if (!p.defaultModel || typeof p.defaultModel !== 'string') errors.push('defaultModel required');
  return { ok: errors.length === 0, errors };
}
