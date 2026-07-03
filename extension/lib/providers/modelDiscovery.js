/**
 * Model Discovery
 *
 * Fetches /models list for a provider + caches to chrome.storage.local
 * (not sync — models list can exceed sync quota per key).
 * Cache TTL 24h. Refresh forced by user "Refresh models" button.
 */
import { fetchModels } from './adapter.js';

const CACHE_KEY = 'providerModels'; // { [providerId]: { list, fetchedAt } }
const TTL_MS = 24 * 60 * 60 * 1000;

async function readCache() {
  const { [CACHE_KEY]: c } = await chrome.storage.local.get(CACHE_KEY);
  return c && typeof c === 'object' ? c : {};
}

async function writeCache(c) {
  await chrome.storage.local.set({ [CACHE_KEY]: c });
}

/**
 * Get cached model list. Returns null if stale/missing.
 */
export async function getCached(providerId) {
  const cache = await readCache();
  const entry = cache[providerId];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) return null;
  return entry.list;
}

/**
 * Refresh + cache models for provider. Returns list.
 */
export async function refresh(provider, apiKey) {
  const list = await fetchModels(provider, apiKey);
  const cache = await readCache();
  cache[provider.id] = { list, fetchedAt: Date.now() };
  await writeCache(cache);
  return list;
}

/**
 * Get list (cached if fresh, else fetch + cache). Empty array on error.
 */
export async function getOrFetch(provider, apiKey) {
  const cached = await getCached(provider.id);
  if (cached && cached.length > 0) return cached;
  try {
    return await refresh(provider, apiKey);
  } catch (err) {
    console.warn(`[modelDiscovery] refresh failed for ${provider.id}:`, err.message);
    return cached || [];
  }
}

/**
 * Wipe cache for one provider (e.g. on key change).
 */
export async function invalidate(providerId) {
  const cache = await readCache();
  delete cache[providerId];
  await writeCache(cache);
}
