// vinline — inbox: Gmail/Outlook scan, email + file cards, hover popups
import { esc, formatDate, isAuthExpired } from './utils.js';
import { resetGmailConnectionUI, emailConnected, emailProvider, gmailToken, outlookToken } from './auth.js';
import { openHint, isExpanded, openModal, closeModal, inboxBody, showToast, activateDialog, setSwitch } from './ui.js';
import { getState, saveAppState } from './state.js';
// file cards → File objects (set when card is created, read when parse is triggered)
const fileCardMap = new Map();
// ─── INBOX SCANNING ───────────────────────────────────────────────────────────

async function scanInbox(token) {
  try {
    const query = 'subject:(invoice OR "order confirmation" OR "bill of lading" OR shipment OR delivery) newer_than:180d';
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(query) + '&maxResults=8',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (isAuthExpired(res)) { resetGmailConnectionUI(); showInboxError(null, true); return; }
    const data = await res.json();
    const msgs = data.messages || [];

    if (!msgs.length) { showInboxNoResults(); return; }

    const details = await Promise.all(msgs.slice(0, 6).map(m =>
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id +
            '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date',
        { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json())
    ));
    populateInboxCards(details);
  } catch (e) {
    showInboxError(e);
  }
}

async function scanOutlookInbox(token) {
  try {
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$search="invoice"&$top=8&$select=from,subject,receivedDateTime',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const msgs = data.value || [];
    if (!msgs.length) { showInboxNoResults(); return; }
    populateOutlookCards(msgs.slice(0, 6));
  } catch (e) {
    showInboxError(e);
  }
}

function populateOutlookCards(msgs) {
  const cards = msgs.map((msg, i) => {
    const from = msg.from?.emailAddress;
    const fromName = from?.name || from?.address?.split('@')[0] || 'Unknown sender';
    const subj = msg.subject || '(no subject)';
    const date = msg.receivedDateTime ? new Date(msg.receivedDateTime) : null;
    const dateStr = date ? formatDate(date) : '';
    const badgeClass = subj.toLowerCase().includes('invoice') ? 'b-inv' :
                       subj.toLowerCase().includes('deliver') || subj.toLowerCase().includes('lading') ? 'b-del' : 'b-inv';
    const badgeTxt = badgeClass === 'b-del' ? 'Delivery' : 'Invoice';
    return { fromName: esc(fromName), subj: esc(subj), dateStr, badgeClass, badgeTxt, zIndex: 10-i };
  });
  inboxBody.innerHTML = cards.map(c =>
    `<div class="ecard" style="z-index:${c.zIndex}">
      <div class="ec-from">${c.fromName}</div>
      <div class="ec-subj">${c.subj}</div>
      <div class="ec-foot"><span class="ec-date">${c.dateStr}</span><span class="badge ${c.badgeClass}">${c.badgeTxt}</span></div>
    </div>`
  ).join('');
  const n = cards.length;
  document.getElementById('inboxCount').textContent = n + ' item' + (n!==1?'s':'');
  setOpenHintReady(n);
}

async function reScan(btn) {
  if (!emailConnected) {
    showToast('Connect an inbox first — tap the inbox button');
    return;
  }
  btn.classList.add('spinning'); btn.disabled = true;
  setOpenHintScanning(); showInboxScanning();
  if (emailProvider === 'Gmail') {
    await scanInbox(gmailToken);
  } else {
    await scanOutlookInbox(outlookToken);
  }
  btn.classList.remove('spinning'); btn.disabled = false;
}

// ─── AUTO-SCAN (Settings toggle: re-scan the connected inbox every 30 min) ────

let autoScanTimer = null;

function applyAutoScan() {
  clearInterval(autoScanTimer);
  autoScanTimer = null;
  if (getState().settings.autoScan) {
    autoScanTimer = setInterval(() => {
      if (document.hidden || !emailConnected) return;
      const btn = document.getElementById('inboxRefreshBtn');
      if (btn && !btn.disabled) reScan(btn);
    }, 30 * 60 * 1000);
  }
}

function toggleAutoScan() {
  const st = getState();
  st.settings.autoScan = !st.settings.autoScan;
  saveAppState();
  setSwitch(document.getElementById('togAutoScan'), st.settings.autoScan);
  applyAutoScan();
  showToast(st.settings.autoScan
    ? 'Auto-scan on — inbox re-scans every 30 minutes while connected'
    : 'Auto-scan off');
}

function populateInboxCards(messages) {
  const cards = messages.map((msg, i) => {
    const h = msg.payload?.headers || [];
    const from = h.find(x => x.name==='From')?.value || 'Unknown sender';
    const subj = h.find(x => x.name==='Subject')?.value || '(no subject)';
    const date = h.find(x => x.name==='Date')?.value || '';
    const fromName = from.replace(/<[^>]+>/, '').trim().replace(/^"|"$/g, '') || from.split('@')[0];
    const dateStr = date ? formatDate(new Date(date)) : '';
    const badgeClass = subj.toLowerCase().includes('invoice') ? 'b-inv' :
                       subj.toLowerCase().includes('deliver') || subj.toLowerCase().includes('lading') ? 'b-del' : 'b-inv';
    const badgeTxt = badgeClass === 'b-del' ? 'Delivery' : 'Invoice';
    return { msgId: msg.id, fromName: esc(fromName), subj: esc(subj), dateStr, badgeClass, badgeTxt, zIndex: 10-i };
  });

  inboxBody.innerHTML = cards.map(c =>
    `<div class="ecard" data-msg-id="${c.msgId}" style="z-index:${c.zIndex}">
      <div class="ec-from">${c.fromName}</div>
      <div class="ec-subj">${c.subj}</div>
      <div class="ec-foot"><span class="ec-date">${c.dateStr}</span><span class="badge ${c.badgeClass}">${c.badgeTxt}</span><button class="btn btn-primary btn-sm" style="margin-left:auto;padding:2px 7px;font-size:9px" onclick="event.stopPropagation();parseEmailCard(this.closest('.ecard'))">Parse invoice</button></div>
    </div>`
  ).join('');

  const n = cards.length;
  document.getElementById('inboxCount').textContent = n + ' item' + (n!==1?'s':'');
  setOpenHintReady(n);
}

function showInboxEmpty() {
  inboxBody.innerHTML = `
    <div class="inbox-state">
      <div class="inbox-state-lbl">Inbox not connected</div>
      <div class="inbox-state-sub">Connect your Gmail or Outlook from the collapsed view to scan for invoices</div>
      <button class="btn btn-sm" style="margin-top:4px" onclick="collapseAndConnect()">Connect inbox →</button>
    </div>`;
}

function showInboxScanning() {
  inboxBody.innerHTML = `
    <div class="inbox-state">
      <div class="inbox-scanning">
        <span class="scan-pulse"></span>scanning inbox…
      </div>
    </div>`;
}

function showInboxNoResults() {
  inboxBody.innerHTML = `
    <div class="inbox-state">
      <div class="inbox-state-lbl">No invoices found</div>
      <div class="inbox-state-sub">No invoice or delivery emails in the last 180 days. Try again once new emails arrive.</div>
    </div>`;
  openHint.innerHTML = '<span style="color:var(--ink-3)">no invoices found</span>';
}

function showInboxError(e, authExpired) {
  const lbl = authExpired ? 'Session expired' : 'Scan failed';
  const sub = authExpired
    ? 'Your Gmail session expired. Reconnect to keep scanning for invoices.'
    : 'Could not read inbox. Check your connection and try reconnecting.';
  inboxBody.innerHTML = `
    <div class="inbox-state">
      <div class="inbox-state-lbl">${lbl}</div>
      <div class="inbox-state-sub">${sub}</div>
      <button class="btn btn-sm" style="margin-top:4px" onclick="collapseAndConnect()">Reconnect →</button>
    </div>`;
  openHint.innerHTML = '<span style="color:var(--red)">' + (authExpired ? 'session expired' : 'scan error') + '</span>';
}

function collapseAndConnect() {
  if (isExpanded) {
    const modal = document.getElementById('modal-l');
    // Move modal out of #collapsed (display:none parent) to body so it can be shown
    document.body.appendChild(modal);
    document.querySelectorAll('.conn-modal').forEach(m => { if (m !== modal) m.style.display = 'none'; });
    const colHead = document.getElementById('colLeft')?.querySelector('.col-head');
    if (colHead) {
      const r = colHead.getBoundingClientRect();
      modal.style.position = 'fixed';
      modal.style.top = (r.bottom + 6) + 'px';
      modal.style.left = r.left + 'px';
      modal.style.right = 'auto';
    }
    modal.style.display = 'block';
    activateDialog(modal, () => closeModal('modal-l'));
    return;
  }
  openModal('modal-l');
}

// ─── OPEN HINT STATES ─────────────────────────────────────────────────────────

function setOpenHintScanning() {
  openHint.innerHTML = '<span class="scan-pulse"></span><span>scanning inbox…</span>';
}

function setOpenHintReady(n) {
  openHint.innerHTML =
    '<span style="color:var(--green-mid);font-weight:500">' + n + ' invoice' + (n!==1?'s':'') + ' found</span>' +
    '<span style="color:var(--rule)"> · </span><span>↓ tap to open</span>';
}

// ─── EMAIL MODAL STATES ───────────────────────────────────────────────────────

function setModalLoading(msg) {
  document.getElementById('emailModalBody').innerHTML =
    '<div class="modal-status"><span class="auth-spinner"></span>' + esc(msg) + '</div>';
  // Cancel stays enabled — a dismissed/blocked popup must never trap the user here
  document.getElementById('emailModalClose').disabled = false;
}

function setModalError(msg) {
  document.getElementById('emailModalBody').innerHTML =
    '<div class="modal-error-msg">' + esc(msg) + '</div>' +
    '<div class="modal-opt" role="button" tabindex="0" onclick="connectGmail()"><div><div class="mo-name">Gmail</div><div class="mo-sub">Try again →</div></div></div>' +
    '<div class="modal-opt" role="button" tabindex="0" onclick="connectOutlook()"><div><div class="mo-name">Outlook</div><div class="mo-sub">Try again →</div></div></div>';
  document.getElementById('emailModalClose').disabled = false;
}

function resetEmailModal() {
  document.getElementById('emailModalHead').textContent = 'Connect inbox';
  document.getElementById('emailModalBody').innerHTML =
    '<div class="modal-opt" role="button" tabindex="0" onclick="connectGmail()"><div><div class="mo-name">Gmail</div><div class="mo-sub">Sign in with Google →</div></div></div>' +
    '<div class="modal-opt" role="button" tabindex="0" onclick="connectOutlook()"><div><div class="mo-name">Outlook</div><div class="mo-sub">Sign in with Microsoft →</div></div></div>' +
    '<div class="modal-opt" role="button" tabindex="0" onclick="uploadInvoiceFile()"><div><div class="mo-name">Invoice file</div><div class="mo-sub">Upload PDF or photo →</div></div></div>';
  document.getElementById('emailModalClose').disabled = false;
  document.getElementById('emailModalClose').textContent = 'Cancel';
}

// ─── PHOTO UPLOAD ─────────────────────────────────────────────────────────────

function triggerPhotoUpload() { document.getElementById('photoInput').click(); }

function uploadInvoiceFile() {
  closeModal('modal-l');
  document.getElementById('photoInput').click();
}

// ─── INVOICE HOVER POPUP ─────────────────────────────────────────────────────

function addPopupToCard(card, fname, items) {
  card.querySelector('.inv-popup')?.remove();
  if (!items.length) return;
  const total = items.reduce((s, it) => s + (parseFloat(it.cost_per_bottle) || 0) * (parseInt(it.qty_bottles) || 0), 0);
  const show = items.slice(0, 8);
  const more = items.length > 8 ? `<div class="popup-row" style="color:var(--ink-3);font-size:8px;padding:2px 0">+${items.length - 8} more items</div>` : '';
  const rowsHtml = show.map(it => {
    const sub = [it.vintage, it.region].filter(Boolean).join(' \xb7 ');
    const qty = parseInt(it.qty_bottles) || 0;
    const price = parseFloat(it.cost_per_bottle) || 0;
    return `<div class="popup-row"><div><div class="popup-wine">${esc(it.name||'')}</div>${sub?`<span class="popup-wine-sub">${esc(sub)}</span>`:''}</div><div class="popup-right"><span class="popup-qty">${qty} btl</span><span class="popup-price">$${price.toFixed(0)}/btl</span></div></div>`;
  }).join('');
  const popup = document.createElement('div');
  popup.className = 'inv-popup';
  popup.innerHTML =
    `<div class="popup-head"><div class="popup-from">${esc(fname)}</div></div>` +
    `<div class="popup-body"><div class="popup-lbl">Contents</div>${rowsHtml}${more}</div>` +
    `<div class="popup-foot"><span class="popup-total-lbl">Invoice total</span><span class="popup-total">$${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>`;
  card.appendChild(popup);
}

export {
  fileCardMap, scanInbox, scanOutlookInbox, populateOutlookCards, reScan,
  populateInboxCards, showInboxEmpty, showInboxScanning,
  showInboxNoResults, showInboxError, collapseAndConnect,
  setOpenHintScanning, setOpenHintReady, setModalLoading, setModalError, resetEmailModal,
  triggerPhotoUpload, uploadInvoiceFile, addPopupToCard,
  toggleAutoScan, applyAutoScan
};