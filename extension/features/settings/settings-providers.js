import * as keyStore from '../../lib/providers/keyStore.js';
import { getOrFetch as getModelsOrFetch } from '../../lib/providers/modelDiscovery.js';
import {
  PROVIDERS,
  PROVIDER_BY_ID,
  resolveProvider,
  validateCustomProvider
} from '../../lib/providers/registry.js';
/**
 * settings-providers.js
 *
 * Multi-provider settings UI wiring (v1.1.0+). Loaded alongside legacy
 * settings.js. Owns the #providersPanel section — provider cards, add-
 * provider modal, custom-provider modal, drag-to-reorder.
 *
 * Also runs one-shot migration of legacy geminiApiKey/cerebrasApiKey/
 * groqApiKey values into the new encrypted keyStore.
 */
import { chatOrchestrator } from '../ai/chatOrchestrator.js';

const $ = (id) => document.getElementById(id);
const CUSTOM_KEY = 'customProviders';
const ORDER_KEY = 'providerOrder';
const MODEL_PICK_KEY = 'providerModelPick';

async function loadState() {
  const [customR, orderR, pickR, ids] = await Promise.all([
    chrome.storage.sync.get(CUSTOM_KEY),
    chrome.storage.sync.get(ORDER_KEY),
    chrome.storage.sync.get(MODEL_PICK_KEY),
    keyStore.list()
  ]);
  return {
    customProviders: customR[CUSTOM_KEY] || {},
    order: orderR[ORDER_KEY] || null,
    picks: pickR[MODEL_PICK_KEY] || {},
    ids
  };
}

async function saveOrder(order) {
  await chrome.storage.sync.set({ [ORDER_KEY]: order });
}

async function saveCustomProviders(map) {
  await chrome.storage.sync.set({ [CUSTOM_KEY]: map });
}

function providerCardHtml(p, opts = {}) {
  const { picked, freeBadgeClass = '' } = opts;
  const freeLabel =
    p.freeTier === 'permanent'
      ? '🎁 Free'
      : p.freeTier === 'trial'
        ? '⏳ Trial'
        : p.freeTier === 'byok'
          ? '🔑 BYOK'
          : p.freeTier === 'localhost'
            ? '🏠 Local'
            : '';
  return `
    <div class="provider-card" role="listitem" draggable="true" data-provider-id="${escapeHtml(p.id)}">
      <div class="provider-card-header">
        <span class="drag-handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
        <strong>${escapeHtml(p.displayName)}</strong>
        <span class="free-badge ${freeBadgeClass}">${freeLabel}</span>
        <span class="provider-status" data-status-for="${escapeHtml(p.id)}">untested</span>
      </div>
      <div class="provider-card-body">
        <div class="provider-meta">
          <code>${escapeHtml(p.baseUrl)}</code>
          ${p.custom ? '<span class="chip">custom</span>' : ''}
        </div>
        <label>Model:
          <select class="provider-model-select" data-model-for="${escapeHtml(p.id)}">
            <option value="">${escapeHtml(picked || p.defaultModel)}</option>
          </select>
        </label>
        <div class="provider-actions">
          <button type="button" class="secondary-btn" data-action="refresh-models"
                  data-provider-id="${escapeHtml(p.id)}">↻ Refresh models</button>
          <button type="button" class="secondary-btn" data-action="test"
                  data-provider-id="${escapeHtml(p.id)}">Test</button>
          <button type="button" class="secondary-btn" data-action="edit-key"
                  data-provider-id="${escapeHtml(p.id)}">Edit key</button>
          <button type="button" class="secondary-btn" data-action="remove"
                  data-provider-id="${escapeHtml(p.id)}">Remove</button>
        </div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

async function render() {
  const state = await loadState();
  const container = $('providerCards');
  if (!container) return;
  const enabledIds =
    state.order && Array.isArray(state.order)
      ? state.order.filter((id) => state.ids.includes(id))
      : state.ids;
  // Append any keyed providers not yet in order
  for (const id of state.ids) if (!enabledIds.includes(id)) enabledIds.push(id);

  if (enabledIds.length === 0) {
    container.innerHTML =
      '<p class="form-help" style="text-align:center;padding:1rem;">No providers configured yet. Click <strong>+ Add Provider</strong> to get started.</p>';
    return;
  }
  container.innerHTML = enabledIds
    .map((id) => resolveProvider(id, state.customProviders))
    .filter(Boolean)
    .map((p) => providerCardHtml(p, { picked: state.picks[p.id] }))
    .join('');

  // Populate model dropdowns from cache (no network call)
  for (const id of enabledIds) {
    const p = resolveProvider(id, state.customProviders);
    if (!p) continue;
    const key = await keyStore.get(id);
    // eslint-disable-next-line no-await-in-loop
    const models = await getModelsOrFetch(p, key).catch(() => []);
    populateModelSelect(id, models, state.picks[id] || p.defaultModel);
  }
}

function populateModelSelect(providerId, models, picked) {
  const sel = document.querySelector(
    `.provider-model-select[data-model-for="${CSS.escape(providerId)}"]`
  );
  if (!sel) return;
  if (!models || models.length === 0) {
    sel.innerHTML = `<option value="${escapeHtml(picked)}">${escapeHtml(picked)}</option>`;
    return;
  }
  const all = [picked, ...models.filter((m) => m !== picked)];
  sel.innerHTML = all
    .map(
      (m) =>
        `<option value="${escapeHtml(m)}"${m === picked ? ' selected' : ''}>${escapeHtml(m)}</option>`
    )
    .join('');
}

function setStatus(providerId, label, className) {
  const el = document.querySelector(`[data-status-for="${CSS.escape(providerId)}"]`);
  if (!el) return;
  el.textContent = label;
  el.className = `provider-status ${className}`;
}

function fillPresetSelect() {
  const sel = $('presetProviderSelect');
  if (!sel) return;
  sel.innerHTML = PROVIDERS.map(
    (p) =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.displayName)} (${p.freeTier})</option>`
  ).join('');
  updatePresetNotes();
  sel.addEventListener('change', updatePresetNotes);
}

function updatePresetNotes() {
  const sel = $('presetProviderSelect');
  if (!sel) return;
  const p = PROVIDER_BY_ID[sel.value];
  if (!p) return;
  const notes = $('presetProviderNotes');
  if (notes) notes.textContent = p.freeNotes;
  const hp = $('presetProviderHomepage');
  if (hp) hp.href = p.homepage;
}

function openModal(id) {
  const m = $(id);
  if (m) m.classList.remove('hidden');
}
function closeModal(id) {
  const m = $(id);
  if (m) m.classList.add('hidden');
}

function attachEventHandlers() {
  const addBtn = $('addProviderBtn');
  if (addBtn)
    addBtn.addEventListener('click', () => {
      fillPresetSelect();
      const keyInput = $('presetProviderKey');
      if (keyInput) keyInput.value = '';
      openModal('addProviderModal');
    });

  const addCustomBtn = $('addCustomProviderBtn');
  if (addCustomBtn)
    addCustomBtn.addEventListener('click', () => {
      for (const id of [
        'customProviderId',
        'customProviderName',
        'customProviderBaseUrl',
        'customProviderDefaultModel',
        'customProviderKey',
        'customProviderAuthHeader'
      ]) {
        const el = $(id);
        if (el) el.value = '';
      }
      const scheme = $('customProviderAuthScheme');
      if (scheme) scheme.value = 'bearer';
      $('customAuthHeaderGroup')?.classList.add('hidden');
      openModal('addCustomProviderModal');
    });

  // Modal close (any [data-close])
  document.addEventListener('click', (e) => {
    const closeId = e.target?.dataset?.close;
    if (closeId) closeModal(closeId);
  });

  // Preset modal — auth scheme toggle
  const schemeSel = $('customProviderAuthScheme');
  if (schemeSel)
    schemeSel.addEventListener('change', () => {
      const group = $('customAuthHeaderGroup');
      if (!group) return;
      group.classList.toggle('hidden', schemeSel.value !== 'header');
    });

  // Save preset provider
  const savePreset = $('savePresetProvider');
  if (savePreset)
    savePreset.addEventListener('click', async () => {
      const id = $('presetProviderSelect')?.value;
      const key = $('presetProviderKey')?.value?.trim();
      if (!id) return;
      if (!key) {
        alert('API key required');
        return;
      }
      await keyStore.set(id, key);
      // Add to end of order
      const { [ORDER_KEY]: order } = await chrome.storage.sync.get(ORDER_KEY);
      const nextOrder = Array.isArray(order) ? order : [];
      if (!nextOrder.includes(id)) nextOrder.push(id);
      await saveOrder(nextOrder);
      closeModal('addProviderModal');
      await render();
    });

  // Save custom provider
  const saveCustom = $('saveCustomProvider');
  if (saveCustom)
    saveCustom.addEventListener('click', async () => {
      const rec = {
        id: $('customProviderId')?.value?.trim(),
        displayName: $('customProviderName')?.value?.trim(),
        baseUrl: ($('customProviderBaseUrl')?.value || '').replace(/\/+$/, ''),
        defaultModel: $('customProviderDefaultModel')?.value?.trim(),
        authScheme: $('customProviderAuthScheme')?.value || 'bearer',
        authHeader: $('customProviderAuthHeader')?.value?.trim() || undefined,
        freeTier: 'byok',
        freeNotes: 'User-added custom provider',
        chatPath: '/chat/completions',
        modelsPath: '/models'
      };
      const validation = validateCustomProvider(rec);
      const errBox = $('customProviderErrors');
      if (!validation.ok) {
        if (errBox) {
          errBox.classList.remove('hidden');
          errBox.innerHTML = validation.errors
            .map((e) => `<div>❌ ${escapeHtml(e)}</div>`)
            .join('');
        }
        return;
      }
      errBox?.classList.add('hidden');
      const { [CUSTOM_KEY]: existing } = await chrome.storage.sync.get(CUSTOM_KEY);
      const next = { ...(existing || {}), [rec.id]: rec };
      await saveCustomProviders(next);
      const key = $('customProviderKey')?.value?.trim();
      if (key) await keyStore.set(rec.id, key);
      const { [ORDER_KEY]: order } = await chrome.storage.sync.get(ORDER_KEY);
      const nextOrder = Array.isArray(order) ? order : [];
      if (!nextOrder.includes(rec.id)) nextOrder.push(rec.id);
      await saveOrder(nextOrder);
      closeModal('addCustomProviderModal');
      await render();
    });

  // Delegated actions on provider cards
  const cardsEl = $('providerCards');
  if (cardsEl)
    cardsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.providerId;
      if (!id) return;
      if (action === 'test') {
        setStatus(id, 'testing…', 'testing');
        const res = await chatOrchestrator.testProvider(id);
        if (res.ok) {
          setStatus(id, `✓ ${res.sampleModels?.length || '?'} models`, 'ok');
          if (res.sampleModels?.length)
            populateModelSelect(
              id,
              res.sampleModels,
              (await chatOrchestrator.getPickedModel(id)) ||
                PROVIDER_BY_ID[id]?.defaultModel ||
                res.sampleModels[0]
            );
        } else {
          setStatus(id, `✗ ${res.error || 'failed'}`, 'error');
        }
        return;
      }
      if (action === 'refresh-models') {
        setStatus(id, 'fetching models…', 'testing');
        try {
          const models = await chatOrchestrator.refreshModels(id);
          setStatus(id, `✓ ${models.length} models`, 'ok');
          populateModelSelect(id, models, (await chatOrchestrator.getPickedModel(id)) || models[0]);
        } catch (err) {
          setStatus(id, `✗ ${err.message}`, 'error');
        }
        return;
      }
      if (action === 'edit-key') {
        const newKey = window.prompt(`Paste new API key for ${id}:`);
        if (newKey) {
          await keyStore.set(id, newKey.trim());
          setStatus(id, 'key updated', 'ok');
        }
        return;
      }
      if (action === 'remove') {
        if (!window.confirm(`Remove provider "${id}"?`)) return;
        await keyStore.remove(id);
        // Also drop from order
        const { [ORDER_KEY]: order } = await chrome.storage.sync.get(ORDER_KEY);
        const nextOrder = Array.isArray(order) ? order.filter((x) => x !== id) : [];
        await saveOrder(nextOrder);
        // If custom, remove from customProviders too
        const { [CUSTOM_KEY]: custom } = await chrome.storage.sync.get(CUSTOM_KEY);
        if (custom?.[id]) {
          const { [id]: _dropped, ...rest } = custom;
          await saveCustomProviders(rest);
        }
        await render();
      }
    });

  // Model select change → persist pick
  if (cardsEl)
    cardsEl.addEventListener('change', async (e) => {
      const sel = e.target.closest('.provider-model-select');
      if (!sel) return;
      const id = sel.dataset.modelFor;
      await chatOrchestrator.setPickedModel(id, sel.value);
    });

  // Drag-to-reorder
  let dragged = null;
  if (cardsEl) {
    cardsEl.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.provider-card');
      if (!card) return;
      dragged = card;
      card.classList.add('dragging');
    });
    cardsEl.addEventListener('dragend', async () => {
      if (!dragged) return;
      dragged.classList.remove('dragging');
      dragged = null;
      const order = Array.from(cardsEl.querySelectorAll('.provider-card')).map(
        (c) => c.dataset.providerId
      );
      await saveOrder(order);
    });
    cardsEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragged) return;
      const target = e.target.closest('.provider-card');
      if (!target || target === dragged) return;
      const rect = target.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) target.before(dragged);
      else target.after(dragged);
    });
  }
}

export async function init() {
  const { migrated } = await keyStore.migrateLegacy();
  if (migrated.length > 0) {
    console.log('[settings-providers] migrated legacy keys:', migrated);
    // Seed order from migration
    await saveOrder(migrated);
  }
  attachEventHandlers();
  await render();
}

// Auto-init on DOMContentLoaded if this is loaded as a module in options.html
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch((err) => console.error('[settings-providers] init failed:', err));
    });
  } else {
    init().catch((err) => console.error('[settings-providers] init failed:', err));
  }
}
