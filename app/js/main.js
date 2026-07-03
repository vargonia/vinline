// vinline — entry point: module bootstrap, window bridge for inline handlers, init
import { API_BASE, APP_VERSION } from './config.js';
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import * as drive from './drive.js';
import * as exporter from './exporter.js';
import * as inbox from './inbox.js';
import * as core from './core.js';

import { esc, getUserAnthropicKey, saveUserAnthropicKey, getAccessCode, saveAccessCode } from './utils.js';
import { inboxBody, openHint, isExpanded, expand, setSwitch } from './ui.js';
import { fileCardMap, showInboxEmpty } from './inbox.js';
import { loadAppState, getState, saveAppState } from './state.js';
import { rehydrateFromState, persistNow } from './core.js';
import { applyAutoScan } from './inbox.js';
import { updateAutoSyncBadge } from './drive.js';

// Inline on* handlers in the markup (and in runtime-generated HTML strings)
// resolve against window — bridge every module export explicitly.
Object.assign(window, utils, ui, auth, drive, exporter, inbox, core);

// Settings: default-margin preset sliders (multiplier per category bucket)
function setMarginPreset(bucket, sliderVal, inputEl) {
  const mult = parseInt(sliderVal, 10) / 10;
  const st = getState();
  st.settings.marginPresets[bucket] = mult;
  saveAppState();
  if (inputEl?.nextElementSibling) inputEl.nextElementSibling.textContent = '\xd7' + mult.toFixed(1);
}
// Settings: bring-your-own Anthropic key (localStorage only, never in app state)
function refreshAnthropicKeyStatus() {
  const el = document.getElementById('anthropicKeyStatus');
  if (!el) return;
  const key = getUserAnthropicKey();
  el.textContent = key ? 'Key saved (•••' + key.slice(-4) + ') — used for your parses in this browser' : 'No key saved';
}

function saveAnthropicKeyFromSettings() {
  const input = document.getElementById('anthropicKeyInput');
  const key = (input?.value || '').trim();
  if (!key) return;
  if (!key.startsWith('sk-ant-')) {
    document.getElementById('anthropicKeyStatus').textContent = 'That does not look like an Anthropic key (should start with sk-ant-)';
    return;
  }
  saveUserAnthropicKey(key);
  input.value = '';
  refreshAnthropicKeyStatus();
}

function clearAnthropicKeyFromSettings() {
  saveUserAnthropicKey('');
  const input = document.getElementById('anthropicKeyInput');
  if (input) input.value = '';
  refreshAnthropicKeyStatus();
}

function refreshAccessCodeStatus() {
  const el = document.getElementById('accessCodeStatus');
  if (!el) return;
  el.textContent = getAccessCode() ? 'Code saved — parses use this instance’s shared key' : 'No code saved';
}

function saveAccessCodeFromSettings() {
  const input = document.getElementById('accessCodeInput');
  const code = (input?.value || '').trim();
  if (!code) return;
  saveAccessCode(code);
  input.value = '';
  refreshAccessCodeStatus();
}

function clearAccessCodeFromSettings() {
  saveAccessCode('');
  const input = document.getElementById('accessCodeInput');
  if (input) input.value = '';
  refreshAccessCodeStatus();
}

Object.assign(window, { setMarginPreset, saveAnthropicKeyFromSettings, clearAnthropicKeyFromSettings, saveAccessCodeFromSettings, clearAccessCodeFromSettings });

// Reflect persisted settings into the Settings panel controls
function initSettingsPanel() {
  const p = getState().settings.marginPresets;
  [['red', 'mgpRed'], ['white', 'mgpWhite'], ['sparkling', 'mgpSparkling'], ['other', 'mgpOther']].forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const mult = p[k] ?? 4.0;
    el.value = Math.round(mult * 10);
    if (el.nextElementSibling) el.nextElementSibling.textContent = '\xd7' + mult.toFixed(1);
  });
  refreshAnthropicKeyStatus();
  refreshAccessCodeStatus();
  setSwitch(document.getElementById('togAutoScan'), getState().settings.autoScan);
  setSwitch(document.getElementById('togAutoSync'), getState().settings.autoSync);
  applyAutoScan();
  updateAutoSyncBadge();
}

function init() {
  // Photo upload input
  const inp = document.createElement('input');
  inp.type = 'file'; inp.id = 'photoInput'; inp.accept = 'image/*,.pdf'; inp.multiple = true; inp.style.display = 'none';
  inp.addEventListener('change', function() {
    if (!this.files.length) return;
    // Clear empty/no-results state on first upload
    const existingCards = inboxBody.querySelectorAll('.ecard');
    if (!existingCards.length) inboxBody.innerHTML = '';
    Array.from(this.files).forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'ecard';
      card.style.zIndex = String(10 - idx);
      card.innerHTML = `
        <div class="ec-from">${esc(file.name.replace(/\.[^/.]+$/, ''))}</div>
        <div class="ec-subj">Invoice file — tap to parse</div>
        <div class="ec-foot">
          <span class="ec-date">Just now</span>
          <span class="badge" style="background:var(--bg-3);color:var(--ink-3)">File</span>
          <button class="btn btn-primary btn-sm" style="margin-left:auto;padding:2px 7px;font-size:9px" onclick="event.stopPropagation();parseFile(this.closest('.ecard'))">Parse invoice</button>
        </div>`;
      fileCardMap.set(card, file);
      inboxBody.insertBefore(card, inboxBody.firstChild);
    });
    const n = inboxBody.querySelectorAll('.ecard').length;
    openHint.innerHTML = '<span style="color:var(--green-mid);font-weight:500">' + n + ' file' + (n !== 1 ? 's' : '') + ' ready to parse</span><span style="color:var(--rule)"> · </span><span>↓ tap to open</span>';
    if (!isExpanded) expand();
    this.value = '';
  });
  document.body.appendChild(inp);

  // Init inbox state
  showInboxEmpty();

  // Restore persisted wine list + inventory from a previous session
  loadAppState();
  initSettingsPanel();
  const restored = rehydrateFromState();
  if (restored && !isExpanded) expand();

  // Keyboard activation for non-button elements carrying role="button"
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element
        && e.target.getAttribute('role') === 'button' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      e.target.click();
    }
  });

  // In-place contenteditable edits (wine names, subs, inventory names) persist on blur
  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (t instanceof Element && (t.closest('.mi') || t.closest('.inv-row'))) persistNow();
  }, true);
}

// ─── ERROR TELEMETRY (lite) ───────────────────────────────────────────────────
// Uncaught errors go to the app's own /api/log (server stdout / Railway logs).
// No third-party service, no cookies; capped at 5 reports per session.
let _errorReports = 0;
function reportClientError(kind, message, stack) {
  if (_errorReports >= 5) return;
  _errorReports += 1;
  try {
    fetch(API_BASE + '/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        message: String(message).slice(0, 500),
        stack: String(stack || '').slice(0, 1500),
        page: location.pathname,
        version: APP_VERSION,
        ua: navigator.userAgent.slice(0, 120),
        ts: new Date().toISOString()
      })
    }).catch(() => {});
  } catch (e) { /* never let telemetry throw */ }
}

window.addEventListener('error', (e) => reportClientError('error', e.message, e.error?.stack));
window.addEventListener('unhandledrejection', (e) => reportClientError('unhandledrejection', e.reason?.message || e.reason, e.reason?.stack));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
