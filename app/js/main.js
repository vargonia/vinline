// vinline — entry point: module bootstrap, window bridge for inline handlers, init
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import * as drive from './drive.js';
import * as exporter from './exporter.js';
import * as inbox from './inbox.js';
import * as core from './core.js';

import { esc } from './utils.js';
import { inboxBody, openHint, isExpanded, expand } from './ui.js';
import { fileCardMap, showInboxEmpty } from './inbox.js';
import { loadAppState } from './state.js';
import { rehydrateFromState, persistNow } from './core.js';

// Inline on* handlers in the markup (and in runtime-generated HTML strings)
// resolve against window — bridge every module export explicitly.
Object.assign(window, utils, ui, auth, drive, exporter, inbox, core);

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
  const restored = rehydrateFromState();
  if (restored && !isExpanded) expand();

  // In-place contenteditable edits (wine names, subs, inventory names) persist on blur
  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (t instanceof Element && (t.closest('.mi') || t.closest('.inv-row'))) persistNow();
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
