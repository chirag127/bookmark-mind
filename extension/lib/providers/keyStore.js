/**
 * Provider Key Store
 *
 * Stores per-provider API keys in chrome.storage.sync with AES-GCM
 * encryption using a device-scoped nonce (chrome.storage.local) + install
 * salt. Not protection against a determined attacker with disk access —
 * this is defense-in-depth vs. another extension harvesting sync storage
 * via a stolen host permission. See docs/PROVIDERS.md § "Key security".
 *
 * Public surface:
 *   list()                    → Promise<string[]>  provider IDs with a key
 *   get(providerId)           → Promise<string|null>
 *   set(providerId, plaintext)→ Promise<void>
 *   remove(providerId)        → Promise<void>
 *   migrateLegacy()           → Promise<{migrated: string[]}>  one-shot v1.0→1.1 migration
 */

const PROVIDERS_KEY = 'providerKeys'; // { [providerId]: { iv, ct } } in chrome.storage.sync
const SALT_KEY = 'bmind_keystore_salt_v1'; // chrome.storage.local
const NONCE_KEY = 'bmind_keystore_nonce_v1'; // chrome.storage.local
const KEY_MATERIAL = 'bmind-provider-key'; // static string; entropy comes from salt+nonce

async function getOrCreateSalt() {
  const { [SALT_KEY]: existing } = await chrome.storage.local.get(SALT_KEY);
  if (existing) return b64ToBytes(existing);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ [SALT_KEY]: bytesToB64(salt) });
  return salt;
}

async function getOrCreateNonce() {
  const { [NONCE_KEY]: existing } = await chrome.storage.local.get(NONCE_KEY);
  if (existing) return existing;
  const nonce = bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
  await chrome.storage.local.set({ [NONCE_KEY]: nonce });
  return nonce;
}

async function deriveKey() {
  const [salt, nonce] = await Promise.all([getOrCreateSalt(), getOrCreateNonce()]);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(KEY_MATERIAL + nonce),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext) {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

async function decrypt(record) {
  const key = await deriveKey();
  const iv = b64ToBytes(record.iv);
  const ct = b64ToBytes(record.ct);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function readMap() {
  const { [PROVIDERS_KEY]: map } = await chrome.storage.sync.get(PROVIDERS_KEY);
  return map && typeof map === 'object' ? map : {};
}
async function writeMap(map) {
  await chrome.storage.sync.set({ [PROVIDERS_KEY]: map });
}

export async function list() {
  const map = await readMap();
  return Object.keys(map);
}

export async function get(providerId) {
  const map = await readMap();
  const rec = map[providerId];
  if (!rec) return null;
  try {
    return await decrypt(rec);
  } catch (err) {
    console.warn(`[keyStore] decrypt failed for ${providerId}:`, err.message);
    return null;
  }
}

export async function set(providerId, plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('keyStore.set: plaintext must be non-empty string');
  }
  const map = await readMap();
  map[providerId] = await encrypt(plaintext);
  await writeMap(map);
}

export async function remove(providerId) {
  const map = await readMap();
  delete map[providerId];
  await writeMap(map);
}

/**
 * One-shot migration from pre-v1.1.0 storage layout.
 * Reads legacy `geminiApiKey`, `cerebrasApiKey`, `groqApiKey` from
 * chrome.storage.sync (plaintext) → encrypts into providerKeys map →
 * removes legacy keys. Idempotent via `providersMigrated` flag.
 */
export async function migrateLegacy() {
  const { providersMigrated } = await chrome.storage.sync.get('providersMigrated');
  if (providersMigrated) return { migrated: [] };

  const legacyKeys = await chrome.storage.sync.get([
    'geminiApiKey',
    'cerebrasApiKey',
    'groqApiKey'
  ]);
  const migrated = [];
  const mapping = {
    geminiApiKey: 'gemini',
    cerebrasApiKey: 'cerebras',
    groqApiKey: 'groq'
  };
  for (const [legacyKey, providerId] of Object.entries(mapping)) {
    const v = legacyKeys[legacyKey];
    if (typeof v === 'string' && v.trim().length > 0) {
      await set(providerId, v.trim());
      migrated.push(providerId);
    }
  }
  await chrome.storage.sync.remove(Object.keys(mapping));
  await chrome.storage.sync.set({ providersMigrated: '1.1.0' });
  return { migrated };
}
