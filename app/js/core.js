// vinline — parse pipeline, inventory rows, margin system, wine list
import { API_BASE, ANTHROPIC_API_KEY, INVOICE_PARSE_PROMPT, CAT_ORDER } from './config.js';
import { esc, isAuthExpired, pdfToBase64, imageToBase64 } from './utils.js';
import { gmailToken, resetGmailConnectionUI } from './auth.js';
import { addPopupToCard, fileCardMap } from './inbox.js';
import { inboxBody, showToast, announce } from './ui.js';
import { getState, saveAppState } from './state.js';
let rowCount = 0;
// MARGIN SYSTEM — arrays are indexed by inventory row index (data-inv-idx)
const costs = [];
const committed = [];
const pending = [];
let displayMode = 'mult';
const committedBtg = [];
const pendingBtg = [];
function sellPrice(cost, mult) { return Math.round(cost * mult); }
function mgLabel(mult) { return displayMode==='mult' ? '×'+mult.toFixed(1) : '+'+Math.round((mult-1)*100)+'%'; }
function multToFill(mult) { return ((mult-1.0)/5.0*100).toFixed(1)+'%'; }
function sliderToMult(val) { return 1.0+(parseFloat(val)/100)*5.0; }

function updateRowDisplay(i) {
  const mult = pending[i];
  const bottleSell = sellPrice(costs[i], mult);
  const displaySell = pendingBtg[i] ? costs[i] : bottleSell;
  document.getElementById('s'+i).textContent = '$'+displaySell;
  document.getElementById('m'+i).textContent = mgLabel(mult);
  document.getElementById('f'+i).style.width = multToFill(mult);
  if (document.getElementById('rng'+i)) document.getElementById('rng'+i).value = ((mult-1.0)/5.0*100).toFixed(0);
  const _wlMi = document.querySelector(`.mi[data-inv-idx="${i}"]`);
  const wlEl = _wlMi?.querySelector('[id^="wlp"]');
  if (wlEl) { wlEl.dataset.bottle = bottleSell; wlEl.textContent = pendingBtg[i] ? wlEl.dataset.glass : bottleSell; }
  if (_wlMi) _wlMi.dataset.btg = pendingBtg[i] ? '1' : '0';
}

function setBtgMode(i, glass) {
  pendingBtg[i] = glass;
  document.getElementById('btgb'+i).classList.toggle('active', !glass);
  document.getElementById('btgg'+i).classList.toggle('active', glass);
  updateRowDisplay(i);
}

function toggleDisplayMode() {
  displayMode = displayMode==='mult' ? 'pct' : 'mult';
  for (let j=0; j<5; j++) { const el = document.getElementById('m'+j); if (el) el.textContent = mgLabel(pending[j]); }
}

function liveMg(i, sliderVal) {
  pending[i] = parseFloat(sliderToMult(sliderVal).toFixed(1));
  updateRowDisplay(i);
}

function nameEl(i) {
  const eb = document.getElementById('eb'+i);
  return eb ? eb.closest('.inv-row')?.querySelector('.ir-name') : null;
}

function openSlider(i) {
  closeAllSliders();
  document.getElementById('eb'+i).style.display = 'none';
  document.getElementById('sw'+i).classList.add('visible');
  const n = nameEl(i); if (n) { n.contentEditable = 'true'; n.focus(); }
  pending[i] = committed[i];
  pendingBtg[i] = committedBtg[i];
  document.getElementById('btgb'+i).classList.toggle('active', !committedBtg[i]);
  document.getElementById('btgg'+i).classList.toggle('active', committedBtg[i]);
  updateRowDisplay(i);
}

function closeAllSliders() {
  for (let i=0; i<committed.length; i++) {
    const eb = document.getElementById('eb'+i);
    const sw = document.getElementById('sw'+i);
    if (eb) {
      eb.style.display = '';
      const n = eb.closest('.inv-row')?.querySelector('.ir-name');
      if (n) { n.contentEditable = 'false'; n.blur(); }
    }
    if (sw) { sw.classList.remove('visible'); pendingBtg[i]=committedBtg[i]; pending[i]=committed[i]; updateRowDisplay(i); }
  }
}

function confirmMg(i) {
  committed[i] = pending[i]; committedBtg[i] = pendingBtg[i];
  document.getElementById('eb'+i).style.display = '';
  document.getElementById('sw'+i).classList.remove('visible');
  const n = nameEl(i); if (n) { n.contentEditable = 'false'; n.blur(); }
  persistNow();
}

function cancelMg(i) {
  pending[i] = committed[i]; pendingBtg[i] = committedBtg[i];
  updateRowDisplay(i);
  document.getElementById('eb'+i).style.display = '';
  document.getElementById('sw'+i).classList.remove('visible');
  const n = nameEl(i); if (n) { n.contentEditable = 'false'; n.blur(); }
}

function markSold(i) {
  const row = document.getElementById('eb' + i)?.closest('.inv-row');
  // Capture restorable snapshots BEFORE anything is removed
  const invItem = row ? snapshotRowItem(row) : null;
  const mi = document.querySelector(`.mi[data-inv-idx="${i}"]`);
  const wlCapture = mi ? { category: mi.closest('.menu-block')?.dataset?.cat || 'Other', item: miToItem(mi) } : null;

  if (row) {
    row.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    row.style.opacity = '0';
    row.style.transform = 'translateX(-6px)';
    setTimeout(() => row.remove(), 230);
  }
  if (mi) {
    mi.style.transition = 'opacity 0.22s ease';
    mi.style.opacity = '0';
    setTimeout(() => {
      const block = mi.closest('.menu-block');
      mi.remove();
      if (block) {
        const cnt = block.querySelectorAll('.mi').length;
        const cntEl = block.querySelector('.sec-count');
        if (cntEl) cntEl.textContent = cnt;
        if (!cnt) block.remove();
      }
      updateWineListFooterCount();
    }, 230);
  }
  setTimeout(() => {
    persistNow();
    if (invItem || wlCapture) {
      showToast(`Marked sold${invItem ? ' — ' + invItem.name : ''}`, {
        actionLabel: 'Undo',
        onAction: () => undoSold(invItem, wlCapture)
      });
    }
  }, 300);
}

function undoSold(invItem, wlCapture) {
  if (invItem) renderInventoryItems([invItem], { append: true });
  if (wlCapture) {
    const wineListBody = document.getElementById('wineListBody');
    if (!wineListBody.querySelector('.menu-block')) wineListBody.innerHTML = '';
    const block = findOrCreateBlock(wineListBody, wlCapture.category);
    const nextWlIdx = wineListBody.querySelectorAll('.mi').length;
    block.insertAdjacentHTML('beforeend', buildMiHtml(wlCapture.item, nextWlIdx));
    const countEl = block.querySelector('.sec-count');
    if (countEl) countEl.textContent = block.querySelectorAll('.mi').length;
    updateWineListFooterCount();
  }
  persistNow();
}

function miToItem(mi) {
  const priceEl = mi.querySelector('[id^="wlp"]');
  return {
    name: mi.querySelector('.mi-name')?.textContent?.trim() || '',
    sub: mi.querySelector('.mi-sub')?.textContent?.trim() || '',
    region: mi.dataset.region || '',
    size: mi.dataset.size || '',
    price: priceEl?.textContent?.trim() || '',
    bottle: priceEl?.dataset?.bottle || '',
    cost: priceEl?.dataset?.glass || '',
    btg: mi.dataset.btg === '1',
    invIdx: mi.dataset.invIdx || ''
  };
}

function gatherWineListData() {
  return [...document.querySelectorAll('#wineListBody .menu-block[data-cat]')].map(block => ({
    category: block.dataset.cat,
    items: [...block.querySelectorAll('.mi')].map(miToItem).filter(it => it.name)
  })).filter(g => g.items.length);
}

// ─── PERSISTENCE (DOM is runtime truth; state is the serialized snapshot) ────

function rowName(row) {
  const nameNode = row.querySelector('.ir-name');
  const clone = nameNode ? nameNode.cloneNode(true) : null;
  if (clone) clone.querySelectorAll('span, button').forEach(s => s.remove());
  return clone ? clone.textContent.trim() : '';
}

function snapshotRowItem(row) {
  const i = parseInt(row.dataset.invIdx, 10);
  const metaSpans = [...row.querySelectorAll('.ir-meta-left span')].filter(s => s.textContent !== '\xb7');
  return {
    invIdx: i,
    name: rowName(row),
    size: metaSpans[0]?.textContent || '',
    qty: (metaSpans[1]?.textContent || '').replace(' btl', '').trim(),
    region: metaSpans[2]?.textContent || '',
    category: row.dataset.category || 'Other',
    cost: costs[i] || 0,
    mult: committed[i] || 4.0,
    btg: !!committedBtg[i],
    parsedAt: row.dataset.parsedAt || null,
    isNew: !!row.querySelector('.new-tag'),
    pushed: row.dataset.pushed === '1'
  };
}

function snapshotInventory() {
  return [...document.querySelectorAll('#invBody .inv-row')].map(snapshotRowItem).filter(it => it.name);
}

function persistNow() {
  const st = getState();
  st.inventory = snapshotInventory();
  st.wineList = gatherWineListData();
  saveAppState();
  // Decoupled signal for listeners (e.g. Drive auto-sync)
  window.dispatchEvent(new CustomEvent('vinline:changed'));
}

// Default multiplier for a newly parsed item, from the Settings margin presets
function presetMultForCategory(cat) {
  const p = getState().settings.marginPresets || {};
  if (cat === 'Sparkling') return p.sparkling ?? 4.0;
  if (cat === 'White' || cat === 'Rosé' || cat === 'Orange') return p.white ?? 4.0;
  if (cat === 'Red') return p.red ?? 4.0;
  return p.other ?? 4.0;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Rebuild inventory rows from state-shaped items. Used by rehydrate, discard-undo
// and sold-undo. With {append:true} existing rows are kept.
function renderInventoryItems(items, opts = {}) {
  const invBody = document.getElementById('invBody');
  if (!opts.append) invBody.innerHTML = '';
  invBody.querySelector('.inbox-state')?.remove();
  let maxIdx = rowCount - 1;
  items.forEach(it => {
    const i = Number.isFinite(it.invIdx) ? it.invIdx : maxIdx + 1;
    maxIdx = Math.max(maxIdx, i);
    while (costs.length <= i) { costs.push(0); committed.push(4.0); pending.push(4.0); committedBtg.push(false); pendingBtg.push(false); }
    costs[i] = it.cost; committed[i] = it.mult; pending[i] = it.mult;
    committedBtg[i] = !!it.btg; pendingBtg[i] = !!it.btg;
    invBody.insertAdjacentHTML('beforeend', buildInvRow(
      { name: it.name, size: it.size, region: it.region, category: it.category, cost_per_bottle: it.cost, qty_bottles: it.qty },
      i, { isNew: it.isNew === true, mult: it.mult, parsedAt: it.parsedAt }
    ));
    updateRowDisplay(i);
    if (it.btg) {
      document.getElementById('btgb' + i)?.classList.remove('active');
      document.getElementById('btgg' + i)?.classList.add('active');
    }
    const row = invBody.querySelector(`.inv-row[data-inv-idx="${i}"]`);
    if (row) {
      if (it.pushed) markPushed(row);
      applyAgeIndicator(row);
    }
  });
  rowCount = Math.max(rowCount, maxIdx + 1);
  const invFoot = document.getElementById('invFoot');
  invFoot.style.display = '';
  invFoot.innerHTML = '<button class="btn btn-primary btn-sm" onclick="pushToWineList()">Push to wine list</button><button class="btn btn-sm" onclick="discardParsed()">Discard</button>';
}

// Inventory health: flag items parsed more than 30 days ago
function applyAgeIndicator(row) {
  const parsedAt = row.dataset.parsedAt;
  if (!parsedAt) return;
  const age = Date.now() - new Date(parsedAt).getTime();
  if (age > THIRTY_DAYS_MS && !row.querySelector('.age-tag')) {
    row.querySelector('.ir-name')?.insertAdjacentHTML('beforeend',
      '<span class="age-tag" title="parsed over 30 days ago — consider re-ordering">30d+</span>');
  }
}

function rehydrateFromState() {
  const st = getState();
  if (!st.inventory.length && !st.wineList.length) return false;

  if (st.inventory.length) renderInventoryItems(st.inventory);

  if (st.wineList.length) {
    const wineListBody = document.getElementById('wineListBody');
    wineListBody.innerHTML = '';
    let wlIdx = 0;
    st.wineList.forEach(sec => {
      const block = document.createElement('div');
      block.className = 'menu-block';
      block.dataset.cat = sec.category;
      block.innerHTML = `<div class="sec-head"><span class="sec-lbl">${esc(sec.category)}</span><span class="sec-rule"></span><span class="sec-count">${sec.items.length}</span></div>`;
      block.insertAdjacentHTML('beforeend', sec.items.map(it => buildMiHtml(it, wlIdx++)).join(''));
      wineListBody.appendChild(block);
    });
    const countEl = document.querySelector('#colRight .col-foot span[style*="margin-left"]');
    if (countEl) countEl.textContent = wlIdx + ' item' + (wlIdx !== 1 ? 's' : '');
  }

  // Re-snapshot after every mutation from here on; nothing to save right now.
  return true;
}
// ─── FILE PARSE FLOW ─────────────────────────────────────────────────────────

async function callClaudeWithInvoiceData(base64, mediaType) {
  const res = await fetch(API_BASE + '/api/claude', {
    method: 'POST',
    headers: {
      'x-api-key-fwd': ANTHROPIC_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: INVOICE_PARSE_PROMPT }
      ]}]
    })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in Claude response');
  return JSON.parse(match[0]);
}

async function parseInvoiceWithClaude(file) {
  if (file.type === 'application/pdf') {
    const base64 = await pdfToBase64(file);
    return callClaudeWithInvoiceData(base64, 'application/pdf');
  }
  const { base64, mediaType } = await imageToBase64(file);
  return callClaudeWithInvoiceData(base64, mediaType);
}

async function fetchAttachmentFromEmail(msgId) {
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msgId + '?format=full',
    { headers: { Authorization: 'Bearer ' + gmailToken } }
  );
  if (isAuthExpired(res)) {
    resetGmailConnectionUI();
    throw new Error('Your Gmail session expired. Reconnect from the inbox panel and try again.');
  }
  if (!res.ok) throw new Error('Could not fetch email from Gmail.');
  const msg = await res.json();

  function findAttachment(parts) {
    if (!parts) return null;
    for (const part of parts) {
      const mime = part.mimeType || '';
      if ((mime.startsWith('image/') || mime === 'application/pdf') && part.body?.attachmentId) {
        return { attachmentId: part.body.attachmentId, mediaType: mime };
      }
      const found = findAttachment(part.parts);
      if (found) return found;
    }
    return null;
  }

  const found = findAttachment(msg.payload?.parts);
  if (!found) return null;

  const attRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msgId + '/attachments/' + found.attachmentId,
    { headers: { Authorization: 'Bearer ' + gmailToken } }
  );
  if (isAuthExpired(attRes)) {
    resetGmailConnectionUI();
    throw new Error('Your Gmail session expired. Reconnect from the inbox panel and try again.');
  }
  if (!attRes.ok) throw new Error('Could not download email attachment.');
  const attData = await attRes.json();
  // Gmail returns base64url — convert to standard base64
  const base64 = (attData.data || '').replace(/-/g, '+').replace(/_/g, '/');
  return { base64, mediaType: found.mediaType };
}

async function parseEmailCard(card) {
  const msgId = card.dataset.msgId;
  if (!msgId) return;
  const fname = card.querySelector('.ec-from')?.textContent || 'Email';
  const btn = card.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'parsing…'; }

  const invBody = document.getElementById('invBody');
  const hadRows = !!invBody.querySelector('.inv-row');
  if (!hadRows) {
    invBody.innerHTML = `<div class="inbox-state"><div class="inbox-scanning"><span class="scan-pulse"></span>parsing ${esc(fname)}…</div></div>`;
  } else {
    invBody.querySelector('#parseLoadingBanner')?.remove();
    invBody.insertAdjacentHTML('beforeend',
      `<div id="parseLoadingBanner" class="inbox-scanning" style="padding:8px 12px;justify-content:flex-start;gap:6px"><span class="scan-pulse"></span>parsing ${esc(fname)}…</div>`
    );
  }

  try {
    const attachment = await fetchAttachmentFromEmail(msgId);
    if (!attachment) throw new Error('No invoice image or PDF found attached to this email. Try uploading the invoice file directly instead.');
    const items = await callClaudeWithInvoiceData(attachment.base64, attachment.mediaType);
    if (!items.length) throw new Error('No wine items found in this invoice.');
    populateParsedItems(fname, items);
    if (btn) { btn.className = 'btn btn-sm'; btn.textContent = 'parsed ✓'; }
  } catch (e) {
    invBody.querySelector('#parseLoadingBanner')?.remove();
    if (!hadRows) {
      invBody.innerHTML = `<div class="inbox-state">
        <div class="inbox-state-lbl">Parse failed</div>
        <div class="inbox-state-sub">${esc(e.message)}</div>
        <button class="btn btn-sm" style="margin-top:4px" onclick="resetInventory()">Dismiss</button>
      </div>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

async function parseFile(card) {
  const file = fileCardMap.get(card);
  const fname = card.querySelector('.ec-from')?.textContent || 'Invoice';
  const btn = card.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'parsing…'; }

  const invBody = document.getElementById('invBody');
  const hadRows = !!invBody.querySelector('.inv-row');
  if (!hadRows) {
    invBody.innerHTML = `<div class="inbox-state"><div class="inbox-scanning"><span class="scan-pulse"></span>parsing ${esc(fname)}…</div></div>`;
  } else {
    invBody.querySelector('#parseLoadingBanner')?.remove();
    invBody.insertAdjacentHTML('beforeend',
      `<div id="parseLoadingBanner" class="inbox-scanning" style="padding:8px 12px;justify-content:flex-start;gap:6px"><span class="scan-pulse"></span>parsing ${esc(fname)}…</div>`
    );
  }

  try {
    if (!file) throw new Error('File reference lost — please re-upload the invoice.');
    const items = await parseInvoiceWithClaude(file);
    if (!items.length) throw new Error('No wine items found in this invoice.');
    populateParsedItems(fname, items);
    addPopupToCard(card, fname, items);
    if (btn) { btn.className = 'btn btn-sm'; btn.textContent = 'parsed ✓'; }
  } catch (e) {
    invBody.querySelector('#parseLoadingBanner')?.remove();
    if (!hadRows) {
      invBody.innerHTML = `<div class="inbox-state">
        <div class="inbox-state-lbl">Parse failed</div>
        <div class="inbox-state-sub">${esc(e.message)}</div>
        <button class="btn btn-sm" style="margin-top:4px" onclick="resetInventory()">Dismiss</button>
      </div>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

async function parseAllFiles() {
  const cards = [...inboxBody.querySelectorAll('.ecard')].filter(c => fileCardMap.has(c));
  if (!cards.length) return;
  if (cards.length === 1) { parseFile(cards[0]); return; }

  cards.forEach(c => {
    const b = c.querySelector('.btn-primary');
    if (b) { b.disabled = true; b.textContent = 'queued…'; }
  });

  const invBodyAF = document.getElementById('invBody');
  const hadRowsAF = !!invBodyAF.querySelector('.inv-row');
  const allItems = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const fname = card.querySelector('.ec-from')?.textContent || 'Invoice';
    const btn = card.querySelector('.btn-primary');
    if (btn) btn.textContent = 'parsing…';

    invBodyAF.querySelector('#parseLoadingBanner')?.remove();
    if (!hadRowsAF && !invBodyAF.querySelector('.inv-row')) {
      invBodyAF.innerHTML = `<div class="inbox-state"><div class="inbox-scanning"><span class="scan-pulse"></span>parsing ${i+1} / ${cards.length}: ${esc(fname)}…</div></div>`;
    } else {
      invBodyAF.insertAdjacentHTML('beforeend',
        `<div id="parseLoadingBanner" class="inbox-scanning" style="padding:8px 12px;justify-content:flex-start;gap:6px"><span class="scan-pulse"></span>parsing ${i+1} / ${cards.length}: ${esc(fname)}…</div>`
      );
    }

    try {
      const file = fileCardMap.get(card);
      if (!file) throw new Error('File reference lost');
      const items = await parseInvoiceWithClaude(file);
      allItems.push(...items);
      addPopupToCard(card, fname, items);
      if (btn) { btn.className = 'btn btn-sm'; btn.textContent = 'parsed ✓'; }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  }

  invBodyAF.querySelector('#parseLoadingBanner')?.remove();

  if (!allItems.length) {
    if (!invBodyAF.querySelector('.inv-row')) {
      invBodyAF.innerHTML = `<div class="inbox-state"><div class="inbox-state-lbl">Nothing parsed</div><div class="inbox-state-sub">No wine items were found across the uploaded files.</div></div>`;
    }
    return;
  }
  const label = cards.length + ' invoice' + (cards.length !== 1 ? 's' : '');
  populateParsedItems(label, allItems);
}

function buildInvRow(item, i, opts = {}) {
  const { isNew = true, mult = 4.0, parsedAt = new Date().toISOString() } = opts;
  const cost = parseFloat(item.cost_per_bottle) || 0;
  const sell = sellPrice(cost, mult);
  const svgX = `<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  const svgOk = `<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1,5 3.5,8.5 9,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const qty = item.qty_bottles || '';
  const size = item.size || '750ml';
  const region = item.region || '';
  const category = item.category || 'Red';
  return `<div class="inv-row${isNew ? ' new-entry' : ''}" data-category="${category}" data-inv-idx="${i}" data-parsed-at="${esc(parsedAt)}">
    <div class="ir-main">
      <div class="ir-top">
        <div class="ir-name" contenteditable="false" spellcheck="false" aria-label="wine name">${esc(item.name)}${isNew ? '<span class="new-tag">new</span>' : ''}</div>
        <div class="ir-right"><span class="ir-cost">cost $${cost.toFixed(2)}</span><span class="ir-sell" id="s${i}">$${sell}</span><span class="ir-mg" id="m${i}" onclick="toggleDisplayMode()" title="tap to switch display">\xd7${mult.toFixed(1)}</span></div>
      </div>
      <div class="ir-bottom">
        <div class="ir-meta-left"><span>${esc(size)}</span><span>\xb7</span><span>${qty} btl</span><span>\xb7</span><span>${esc(region)}</span></div>
        <div class="ir-controls">
          <button class="edit-btn" id="eb${i}" onclick="openSlider(${i})" aria-label="edit ${esc(item.name)}">edit</button>
          <div class="slider-wrap" id="sw${i}">
            <div class="btg-row-pill"><button class="btg-r active" id="btgb${i}" onclick="setBtgMode(${i},false)">Btl</button><button class="btg-r" id="btgg${i}" onclick="setBtgMode(${i},true)">Glass</button></div>
            <button class="sold-btn" onclick="markSold(${i})" aria-label="mark ${esc(item.name)} sold">sold</button>
            <div class="mg-track"><div class="mg-track-bg"></div><div class="mg-track-fill" id="f${i}" style="width:60%"></div><input class="mg-slider" type="range" min="0" max="100" value="60" step="1" oninput="liveMg(${i},this.value)" id="rng${i}" aria-label="margin multiplier for ${esc(item.name)}"></div>
            <button class="icon-btn cancel" onclick="cancelMg(${i})" aria-label="cancel">${svgX}</button>
            <button class="icon-btn confirm" onclick="confirmMg(${i})" aria-label="confirm">${svgOk}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function populateParsedItems(source, items) {
  const invBody = document.getElementById('invBody');
  const hasRows = !!invBody.querySelector('.inv-row');
  const startIdx = rowCount;

  while (costs.length < rowCount + items.length) {
    costs.push(0); committed.push(4.0); pending.push(4.0);
    committedBtg.push(false); pendingBtg.push(false);
  }
  items.forEach((item, j) => {
    const i = rowCount + j;
    costs[i] = parseFloat(item.cost_per_bottle) || 0;
    const mult = presetMultForCategory(item.category || 'Red');
    committed[i] = mult; pending[i] = mult;
    committedBtg[i] = false; pendingBtg[i] = false;
  });
  rowCount += items.length;

  invBody.querySelector('.inbox-state')?.remove();
  invBody.querySelector('#parseLoadingBanner')?.remove();

  if (!hasRows) {
    invBody.insertAdjacentHTML('afterbegin',
      `<div class="parse-banner"><span class="pb-txt">Raw parse \xb7 ${esc(source)} — review before confirming</span><button class="pb-btn" onclick="pushToWineList()">Confirm all</button></div>`
    );
  } else {
    const pbTxt = invBody.querySelector('.pb-txt');
    if (pbTxt) pbTxt.textContent = 'Multiple invoices parsed — review before confirming';
  }

  invBody.insertAdjacentHTML('beforeend',
    `<div class="sec-lbl">Parsed \xb7 ${items.length} new</div>` +
    items.map((item, j) => buildInvRow(item, startIdx + j, { mult: committed[startIdx + j] })).join('')
  );

  const invFoot = document.getElementById('invFoot');
  invFoot.style.display = '';
  invFoot.innerHTML = '<button class="btn btn-primary btn-sm" onclick="pushToWineList()">Push to wine list</button><button class="btn btn-sm" onclick="discardParsed()">Discard</button>';
  persistNow();
  announce(items.length + ' item' + (items.length !== 1 ? 's' : '') + ' parsed into inventory');
}

// ─── DUPLICATE DETECTION ──────────────────────────────────────────────────────

function normalizeWineName(name) {
  return name.toLowerCase()
    .replace(/["'’“”().,]/g, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\bnv\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function extractVintage(name) {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

// Token-overlap match of a candidate name against the current wine list.
// Returns { mi, existingName, exact } or null.
function findWineListMatch(name) {
  const norm = normalizeWineName(name);
  if (!norm) return null;
  const tokens = new Set(norm.split(' ').filter(t => t.length > 2));
  for (const mi of document.querySelectorAll('#wineListBody .mi')) {
    const existingName = mi.querySelector('.mi-name')?.textContent?.trim() || '';
    const enorm = normalizeWineName(existingName);
    if (!enorm) continue;
    if (enorm === norm) return { mi, existingName, exact: true };
    const etokens = enorm.split(' ').filter(t => t.length > 2);
    if (!etokens.length || !tokens.size) continue;
    const overlap = etokens.filter(t => tokens.has(t)).length;
    if (overlap / Math.max(tokens.size, etokens.length) >= 0.75) return { mi, existingName, exact: false };
  }
  return null;
}

// ─── WINE LIST ───────────────────────────────────────────────────────────────

function updateWineListFooterCount() {
  const total = document.querySelectorAll('#wineListBody .mi').length;
  const footEl = document.querySelector('#colRight .col-foot span[style*="margin-left"]');
  if (footEl) footEl.textContent = total + ' item' + (total !== 1 ? 's' : '');
}

function findOrCreateBlock(wineListBody, cat) {
  let block = [...wineListBody.querySelectorAll('.menu-block[data-cat]')].find(b => b.dataset.cat === cat);
  if (!block) {
    block = document.createElement('div');
    block.className = 'menu-block';
    block.dataset.cat = cat;
    block.innerHTML = `<div class="sec-head"><span class="sec-lbl">${esc(cat)}</span><span class="sec-rule"></span><span class="sec-count">0</span></div>`;
    const insertBefore = [...wineListBody.querySelectorAll('.menu-block[data-cat]')]
      .find(b => CAT_ORDER.indexOf(b.dataset.cat) > CAT_ORDER.indexOf(cat));
    insertBefore ? wineListBody.insertBefore(block, insertBefore) : wineListBody.appendChild(block);
  }
  return block;
}

// Mark an inventory row as pushed: swap status tags, exclude from future pushes
function markPushed(row) {
  row.dataset.pushed = '1';
  const nameNode = row.querySelector('.ir-name');
  if (!nameNode) return;
  nameNode.querySelectorAll('.new-tag, .dup-tag, .vint-tag, .push-anyway').forEach(el => el.remove());
  if (!nameNode.querySelector('.onlist-tag')) {
    nameNode.insertAdjacentHTML('beforeend', '<span class="onlist-tag">on list</span>');
  }
}

function flagDupRow(row, vintageDiffers) {
  const nameNode = row.querySelector('.ir-name');
  if (!nameNode) return;
  nameNode.querySelectorAll('.new-tag, .dup-tag, .vint-tag, .push-anyway').forEach(el => el.remove());
  const i = row.dataset.invIdx;
  const tag = vintageDiffers
    ? '<span class="vint-tag" title="a different vintage of this wine is already on the list">newer vintage?</span>'
    : '<span class="dup-tag" title="a wine with this name is already on the list">already on list</span>';
  nameNode.insertAdjacentHTML('beforeend',
    tag + `<button class="push-anyway" onclick="pushRowAnyway(${i})" title="push this item to the wine list anyway">push anyway</button>`);
}

function pushRowAnyway(i) {
  const row = document.querySelector(`#invBody .inv-row[data-inv-idx="${i}"]`);
  if (row) { pushRows([row]); persistNow(); }
}

// Single template for a wine-list item — used by pushToWineList and rehydrate.
// item: { name, sub?, region, size, price, cost, bottle?, btg?, invIdx }
function buildMiHtml(item, wlIdx) {
  const sub = item.sub || `${item.size} \xb7 ${item.region}`;
  const bottle = item.bottle || item.price;
  return `<div class="mi" data-inv-idx="${item.invIdx}" data-region="${esc(item.region)}" data-size="${esc(item.size)}" data-btg="${item.btg ? '1' : '0'}"><div class="mi-left"><div class="mi-name" contenteditable="true" spellcheck="false" aria-label="wine name — editable">${esc(item.name)}</div><span class="mi-sub" contenteditable="true" spellcheck="false" aria-label="wine details — editable">${esc(sub)}</span></div><div class="mi-right"><div class="mi-price"><span class="dollar">$</span><span id="wlp${wlIdx}" data-bottle="${bottle}" data-glass="${item.cost}">${item.price}</span></div><span class="mi-edit-hint">edit</span></div></div>`;
}

// Push specific inventory rows to the wine list (no duplicate check here)
function pushRows(rows) {
  if (!rows.length) return;
  const wineListBody = document.getElementById('wineListBody');
  if (!wineListBody.querySelector('.menu-block')) wineListBody.innerHTML = '';

  const items = rows.map(row => {
    const metaSpans = [...row.querySelectorAll('.ir-meta-left span')].filter(s => s.textContent !== '\xb7');
    const invIdx = parseInt(row.dataset.invIdx, 10);
    return {
      name: rowName(row),
      size: metaSpans[0]?.textContent || '',
      region: metaSpans[2]?.textContent || '',
      price: row.querySelector('.ir-sell')?.textContent?.replace('$', '') || '0',
      cost: row.querySelector('.ir-cost')?.textContent?.replace('cost $', '') || '0',
      category: CAT_ORDER.includes(row.dataset.category) ? row.dataset.category : 'Other',
      btg: !!committedBtg[invIdx],
      invIdx: row.dataset.invIdx || ''
    };
  });

  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  CAT_ORDER.forEach(cat => {
    const group = groups[cat];
    if (!group || !group.length) return;
    const block = findOrCreateBlock(wineListBody, cat);
    let nextWlIdx = wineListBody.querySelectorAll('.mi').length;
    block.insertAdjacentHTML('beforeend', group.map(item => buildMiHtml(item, nextWlIdx++)).join(''));
    const countEl = block.querySelector('.sec-count');
    if (countEl) countEl.textContent = block.querySelectorAll('.mi').length;
  });

  updateWineListFooterCount();
  rows.forEach(markPushed);
  announce(rows.length + ' item' + (rows.length !== 1 ? 's' : '') + ' added to the wine list');
}

function pushToWineList() {
  // Rows already on the list (pushed earlier) are skipped automatically
  const rows = [...document.querySelectorAll('#invBody .inv-row')].filter(r => r.dataset.pushed !== '1');
  if (!rows.length) return;

  const clean = [], dupes = [];
  rows.forEach(row => {
    const name = rowName(row);
    const match = findWineListMatch(name);
    if (!match) { clean.push(row); return; }
    const newV = extractVintage(name);
    const oldV = extractVintage(match.existingName);
    dupes.push({ row, vintageDiffers: !!(newV && oldV && newV !== oldV) });
  });

  pushRows(clean);
  dupes.forEach(({ row, vintageDiffers }) => flagDupRow(row, vintageDiffers));
  if (dupes.length) {
    showToast(`${dupes.length} item${dupes.length > 1 ? 's' : ''} skipped — already on the wine list`, { duration: 6000 });
  }

  // Keep inventory rows — remove parse banner and section labels, rows persist until sold
  document.getElementById('invBody').querySelectorAll('.parse-banner, .sec-lbl').forEach(el => el.remove());
  document.getElementById('invFoot').style.display = 'none';
  document.getElementById('invFoot').innerHTML = '';
  persistNow();
}

function resetInventory() {
  document.getElementById('invBody').innerHTML =
    `<div class="inbox-state"><div class="inbox-state-lbl">No inventory</div><div class="inbox-state-sub">Connect an inbox or upload an invoice file to populate inventory.</div></div>`;
  document.getElementById('invFoot').style.display = 'none';
  document.getElementById('invFoot').innerHTML = '';
  // rowCount intentionally NOT reset: wine-list items keep data-inv-idx references,
  // so indices must never be reused within a session or live price sync would
  // target the wrong wine-list row after a discard + new parse.
  persistNow();
}

function discardParsed() {
  const items = snapshotInventory();
  resetInventory();
  if (items.length) {
    showToast('Inventory discarded', {
      actionLabel: 'Undo',
      onAction: () => { renderInventoryItems(items); persistNow(); }
    });
  }
}

export {
  costs, committed, pending, committedBtg, pendingBtg,
  sellPrice, mgLabel, multToFill, sliderToMult, updateRowDisplay, setBtgMode, toggleDisplayMode,
  liveMg, nameEl, openSlider, closeAllSliders, confirmMg, cancelMg, markSold,
  gatherWineListData, callClaudeWithInvoiceData, parseInvoiceWithClaude, fetchAttachmentFromEmail,
  parseEmailCard, parseFile, parseAllFiles, buildInvRow, buildMiHtml, populateParsedItems,
  pushToWineList, pushRows, pushRowAnyway, resetInventory, discardParsed,
  persistNow, rehydrateFromState, renderInventoryItems,
  normalizeWineName, extractVintage, findWineListMatch, presetMultForCategory
};
