# BookmarkMind — Providers

BookmarkMind supports any OpenAI-compatible chat API. Twelve providers ship built-in
plus an "Add custom" flow for anything else.

## Built-in providers

| Provider | Free tier | Base URL |
|---|---|---|
| Groq | 🎁 Permanent, no card. 30 RPM. | `https://api.groq.com/openai/v1` |
| Cerebras | 🎁 Permanent, no card. 1M tok/day, 8K ctx cap on free. | `https://api.cerebras.ai/v1` |
| Google Gemini (OpenAI-compat) | 🎁 Permanent, no card. Not in EU/UK/CH. Trains on prompts. | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenRouter | 🎁 Aggregator with 20+ `:free` models. 20 RPM / 50 RPD. | `https://openrouter.ai/api/v1` |
| Mistral (Experiment plan) | 🎁 Free. Trains on prompts unless opted out. | `https://api.mistral.ai/v1` |
| HuggingFace Router | 🎁 Free with HF account. Cold starts 30s+. | `https://router.huggingface.co/v1` |
| Novita | ⏳ $0.50 trial credits. | `https://api.novita.ai/v3/openai` |
| DeepSeek | ⏳ 5M tokens on signup, 30 days. | `https://api.deepseek.com/v1` |
| OpenAI | ⏳ Trial credits regional. | `https://api.openai.com/v1` |
| LM Studio | 🏠 localhost. | `http://localhost:1234/v1` |
| Ollama | 🏠 localhost. Set `OLLAMA_ORIGINS=chrome-extension://*` env var. | `http://localhost:11434/v1` |
| LiteLLM Proxy | 🔑 BYOK via self-hosted proxy. | `http://localhost:4000/v1` |

## Adding a provider

1. Open BookmarkMind Options
2. Under "AI Providers" click **+ Add Provider**
3. Pick the provider, paste your API key, hit Save
4. Click **Test** to verify the key works
5. Click **↻ Refresh models** to load the model dropdown
6. Drag providers to reorder (top = tried first for each categorization)

## Adding a custom provider

For any OpenAI-compatible endpoint not in the built-in list (self-hosted vLLM, LM
Studio on a non-default port, a corporate proxy, another vendor):

1. Click **+ Custom (OpenAI-compat URL)**
2. Fill in:
   - **ID**: kebab-case slug, unique (e.g. `my-vllm`)
   - **Display name**: label shown in the UI
   - **Base URL**: no trailing slash, e.g. `https://ai.example.com/v1`
   - **Default model**: initial model to use before `/models` discovery runs
   - **Auth scheme**:
     - `Bearer` (most): sends `Authorization: Bearer YOUR_KEY`
     - `Custom header`: pick a header name, e.g. `x-api-key`
     - `Query parameter`: appends `?key=YOUR_KEY` to every request
   - **API key**: optional for localhost/anonymous endpoints

Custom providers live in `chrome.storage.sync` and sync across your Chrome
profile like any other setting.

## Provider fallback

BookmarkMind uses the first working provider for each request. If a provider
returns HTTP 429 (rate limit), it's cooled off for 5 minutes and the next
provider in your order is used. HTTP 401/403 stops the chain immediately
(auth errors won't fall through to another provider's key).

## Key security

Keys are encrypted with AES-GCM before writing to `chrome.storage.sync`. The
encryption key is derived from PBKDF2(SHA-256, 100K iters) over a static
material string + per-install random nonce stored in `chrome.storage.local`.

**This is defense-in-depth vs another extension reading `chrome.storage.sync`
via a stolen host permission.** It is NOT protection against a determined
attacker with local disk access — the nonce lives alongside the ciphertext.

For higher-value keys (production OpenAI, paid tiers): use a self-hosted
LiteLLM proxy and register it as a custom provider. BookmarkMind then only
sees a proxy token, not your upstream key.

## Migration from v1.0.0

On first load of v1.1.0+, BookmarkMind reads any legacy `geminiApiKey`,
`cerebrasApiKey`, `groqApiKey` from `chrome.storage.sync` (they were stored
plaintext in v1.0.0), moves them into the new encrypted key store, and
removes the plaintext originals. The one-shot migration flag
`providersMigrated: '1.1.0'` prevents re-runs.

## Adding a built-in provider (contributors)

Edit `extension/lib/providers/registry.js`, add an entry to the `PROVIDERS`
array. Verify base URL + auth by testing with a real key locally. Ship as a
PR with a link to the provider's docs page. Tests in
`tests/features/lib/providers/registry.test.js` will run in CI.
