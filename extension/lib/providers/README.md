# BookmarkMind Provider Layer

Provider-agnostic AI adapter for the extension. Every LLM call in the
extension goes through this layer.

## Files

- `registry.js` — catalog of 12 built-in OpenAI-compat providers + custom-provider validator
- `adapter.js` — `fetchChat()`, `fetchModels()`, `testAuth()` — uniform surface, per-provider auth quirks handled internally
- `keyStore.js` — AES-GCM encrypted key storage in `chrome.storage.sync` + one-shot legacy migration
- `modelDiscovery.js` — `/models` cache in `chrome.storage.local`, 24h TTL

## Adding a new provider

Two paths:

1. **Built-in** (for popular OpenAI-compat providers) — edit `registry.js` `PROVIDERS`
   array. Verify by adding a provider `id`, `baseUrl`, `authScheme`, and
   `defaultModel`. Ship a PR with a link to the provider's docs.

2. **User custom** (localhost, self-hosted, niche providers) — user hits
   "Add provider → Custom" in settings.  Runtime validation via
   `validateCustomProvider()`.

## Provider record shape

```js
{
  id: 'kebab-case-slug',        // required, unique
  displayName: 'Human Label',   // required
  baseUrl: 'https://…/v1',      // required, no trailing /
  chatPath: '/chat/completions',// optional, defaults shown
  modelsPath: '/models',
  authScheme: 'bearer' | 'header' | 'query',
  authHeader: 'x-api-key',      // required when authScheme=header
  authPrefix: '',               // optional prefix for header value
  defaultModel: 'llama-3…',     // required
  freeTier: 'permanent' | 'trial' | 'byok' | 'localhost',
  freeNotes: 'one-liner shown as tooltip',
  homepage: 'https://…',        // "Get key" button link
}
```

## Key security model

Keys are encrypted with AES-GCM before writing to `chrome.storage.sync`.
Encryption key derived from PBKDF2(SHA-256, 100K iters) over a static
material string + per-install random nonce (in `chrome.storage.local`).

This protects against another extension harvesting `chrome.storage.sync`
via a stolen host permission. It does NOT protect against a determined
attacker with local disk access — the encryption nonce is stored
alongside the ciphertext (any code running under this extension's
origin can decrypt).

For higher-value keys (production OpenAI accounts): prefer a self-hosted
LiteLLM proxy (see registry.js `litellm` entry) so the extension only
ever sees a proxy token, not the upstream key.
