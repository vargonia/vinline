// vinline — parse pipeline, inventory rows, margin system, wine list
import { API_BASE, ANTHROPIC_API_KEY, INVOICE_PARSE_PROMPT, CAT_ORDER } from './config.js';
import { esc, isAuthExpired, pdfToBase64, imageToBase64 } from './utils.js';
import { gmailToken, resetGmailConnectionUI } from './auth.js';
import { addPopupToCard, fileCardMap } from './inbox.js';
import { inboxBody } from './ui.js';
let rowCount = 0;
// MARGIN SYSTEM
const costs = [71, 12, 18, 15, 28];
const committed = [4.0, 4.0, 4.0, 4.0, 4.0];
const pending = [...committed];
let displayMode = 'mult';
const committedBtg = [false, false, false, false, false];
const pendingBtg   = [false, false, false, false, false];
const wlMap = [0, 1, 2, 3, 4];
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
  if (row) {
    row.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    row.style.opacity = '0';
    row.style.transform = 'translateX(-6px)';
    setTimeout(() => row.remove(), 230);
  }
  const mi = document.querySelector(`.mi[data-inv-idx="${i}"]`);
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
      const total = document.querySelectorAll('#wineListBody .mi').length;
      const footEl = document.querySelector('#colRight .col-foot span[style*="margin-left"]');
      if (footEl) footEl.textContent = total + ' item' + (total !== 1 ? 's' : '');
    }, 230);
  }
}

function gatherWineListData() {
  return [...document.querySelectorAll('#wineListBody .menu-block[data-cat]')].map(block => ({
    category: block.dataset.cat,
    items: [...block.querySelectorAll('.mi')].map(mi => ({
      name: mi.querySelector('.mi-name')?.textContent?.trim() || '',
      sub: mi.querySelector('.mi-sub')?.textContent?.trim() || '',
      region: mi.dataset.region || '',
      size: mi.dataset.size || '',
      price: mi.querySelector('[id^="wlp"]')?.textContent?.trim() || ''
    })).filter(it => it.name)
  })).filter(g => g.items.length);
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

function buildInvRow(item, i) {
  const cost = parseFloat(item.cost_per_bottle) || 0;
  const sell = Math.round(cost * 4);
  const svgX = `<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  const svgOk = `<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1,5 3.5,8.5 9,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const qty = item.qty_bottles || '';
  const size = item.size || '750ml';
  const region = item.region || '';
  const category = item.category || 'Red';
  return `<div class="inv-row new-entry" data-category="${category}" data-inv-idx="${i}">
    <div class="ir-main">
      <div class="ir-top">
        <div class="ir-name" contenteditable="false" spellcheck="false">${esc(item.name)}<span class="new-tag">new</span></div>
        <div class="ir-right"><span class="ir-cost">cost $${cost.toFixed(2)}</span><span class="ir-sell" id="s${i}">$${sell}</span><span class="ir-mg" id="m${i}" onclick="toggleDisplayMode()" title="tap to switch display">\xd74.0</span></div>
      </div>
      <div class="ir-bottom">
        <div class="ir-meta-left"><span>${esc(size)}</span><span>\xb7</span><span>${qty} btl</span><span>\xb7</span><span>${esc(region)}</span></div>
        <div class="ir-controls">
          <button class="edit-btn" id="eb${i}" onclick="openSlider(${i})">edit</button>
          <div class="slider-wrap" id="sw${i}">
            <div class="btg-row-pill"><button class="btg-r active" id="btgb${i}" onclick="setBtgMode(${i},false)">Btl</button><button class="btg-r" id="btgg${i}" onclick="setBtgMode(${i},true)">Glass</button></div>
            <button class="sold-btn" onclick="markSold(${i})">sold</button>
            <div class="mg-track"><div class="mg-track-bg"></div><div class="mg-track-fill" id="f${i}" style="width:60%"></div><input class="mg-slider" type="range" min="0" max="100" value="60" step="1" oninput="liveMg(${i},this.value)" id="rng${i}"></div>
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
    committed[i] = 4.0; pending[i] = 4.0;
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
    items.map((item, j) => buildInvRow(item, startIdx + j)).join('')
  );

  const invFoot = document.getElementById('invFoot');
  invFoot.style.display = '';
  invFoot.innerHTML = '<button class="btn btn-primary btn-sm" onclick="pushToWineList()">Push to wine list</button><button class="btn btn-sm" onclick="discardParsed()">Discard</button>';
}

function pushToWineList() {
  const rows = [...document.querySelectorAll('#invBody .inv-row')];
  if (!rows.length) return;

  const wineListBody = document.getElementById('wineListBody');
  if (!wineListBody.querySelector('.menu-block')) wineListBody.innerHTML = '';

  const items = rows.map(row => {
    const nameNode = row.querySelector('.ir-name');
    const clone = nameNode ? nameNode.cloneNode(true) : null;
    if (clone) clone.querySelectorAll('span').forEach(s => s.remove());
    const name = clone ? clone.textContent.trim() : '';
    const metaSpans = [...row.querySelectorAll('.ir-meta-left span')].filter(s => s.textContent !== '\xb7');
    const size = metaSpans[0]?.textContent || '';
    const region = metaSpans[2]?.textContent || '';
    const price = row.querySelector('.ir-sell')?.textContent?.replace('$','') || '0';
    const cost = row.querySelector('.ir-cost')?.textContent?.replace('cost $','') || '0';
    const category = CAT_ORDER.includes(row.dataset.category) ? row.dataset.category : 'Other';
    const invIdx = row.dataset.invIdx || '';
    return { name, size, region, price, cost, category, invIdx };
  });

  // Group items by category preserving CAT_ORDER
  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  CAT_ORDER.forEach(cat => {
    const group = groups[cat];
    if (!group || !group.length) return;

    // Find or create the section block for this category
    let block = [...wineListBody.querySelectorAll('.menu-block[data-cat]')]
      .find(b => b.dataset.cat === cat);

    if (!block) {
      block = document.createElement('div');
      block.className = 'menu-block';
      block.dataset.cat = cat;
      block.innerHTML = `<div class="sec-head"><span class="sec-lbl">${cat}</span><span class="sec-rule"></span><span class="sec-count">0</span></div>`;
      // Insert before the first existing block whose category comes later
      const insertBefore = [...wineListBody.querySelectorAll('.menu-block[data-cat]')]
        .find(b => CAT_ORDER.indexOf(b.dataset.cat) > CAT_ORDER.indexOf(cat));
      insertBefore ? wineListBody.insertBefore(block, insertBefore) : wineListBody.appendChild(block);
    }

    // Append .mi rows — wlIdx is global so IDs stay unique across pushes
    const miHtml = group.map(item => {
      const wlIdx = wineListBody.querySelectorAll('.mi').length;
      return `<div class="mi" data-inv-idx="${item.invIdx}" data-region="${esc(item.region)}" data-size="${esc(item.size)}"><div class="mi-left"><div class="mi-name" contenteditable="true" spellcheck="false">${esc(item.name)}</div><span class="mi-sub" contenteditable="true" spellcheck="false">${esc(item.size)} \xb7 ${esc(item.region)}</span></div><div class="mi-right"><div class="mi-price"><span class="dollar">$</span><span id="wlp${wlIdx}" data-bottle="${item.price}" data-glass="${item.cost}">${item.price}</span></div><span class="mi-edit-hint">edit</span></div></div>`;
    }).join('');
    block.insertAdjacentHTML('beforeend', miHtml);

    // Update section item count
    const countEl = block.querySelector('.sec-count');
    if (countEl) countEl.textContent = block.querySelectorAll('.mi').length;
  });

  const total = wineListBody.querySelectorAll('.mi').length;
  const countEl = document.querySelector('#colRight .col-foot span[style*="margin-left"]');
  if (countEl) countEl.textContent = total + ' item' + (total !== 1 ? 's' : '');

  // Keep inventory rows — remove parse banner and section labels, rows persist until sold
  document.getElementById('invBody').querySelectorAll('.parse-banner, .sec-lbl').forEach(el => el.remove());
  document.getElementById('invFoot').style.display = 'none';
  document.getElementById('invFoot').innerHTML = '';
}

function resetInventory() {
  document.getElementById('invBody').innerHTML =
    `<div class="inbox-state"><div class="inbox-state-lbl">No inventory</div><div class="inbox-state-sub">Connect an inbox or upload an invoice file to populate inventory.</div></div>`;
  document.getElementById('invFoot').style.display = 'none';
  document.getElementById('invFoot').innerHTML = '';
  rowCount = 0;
}

function discardParsed() { resetInventory(); }

export {
  costs, committed, pending, committedBtg, pendingBtg,
  sellPrice, mgLabel, multToFill, sliderToMult, updateRowDisplay, setBtgMode, toggleDisplayMode,
  liveMg, nameEl, openSlider, closeAllSliders, confirmMg, cancelMg, markSold,
  gatherWineListData, callClaudeWithInvoiceData, parseInvoiceWithClaude, fetchAttachmentFromEmail,
  parseEmailCard, parseFile, parseAllFiles, buildInvRow, populateParsedItems,
  pushToWineList, resetInventory, discardParsed
};
