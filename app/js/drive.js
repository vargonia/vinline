// vinline — Google Drive OAuth, Picker, Sheets/Docs sync
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY, COLOR_SWATCHES } from './config.js';
import { isAuthExpired, esc } from './utils.js';
import { openModal, settings, collapsed, expanded, isExpanded, showToast } from './ui.js';
import { loadExportStyle, resolveSectionConfig, formatPrice } from './exporter.js';
import { gatherWineListData } from './core.js';
import { getState, saveAppState } from './state.js';
// DRIVE STATE
let driveConnected = false;
let driveToken = null;
let driveFile = null; // { id, name, mimeType }
let hasManualSynced = false; // auto-sync arms only after one explicit sync this session
let autoSyncTimer = null;
// ─── DRIVE AUTH & PICKER ─────────────────────────────────────────────────────

function connectDrive() {
  if (!window.google?.accounts?.oauth2) {
    setDriveModalError('Google sign-in is still loading. Please try again.');
    return;
  }
  setDriveModalLoading('Opening Google sign-in…');
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (response) => {
      if (response.error) {
        setDriveModalError(response.error === 'access_denied' ? 'Access denied.' : 'Sign-in failed: ' + response.error);
        return;
      }
      driveToken = response.access_token;
      setDriveModalLoading('Opening file browser…');
      loadAndOpenPicker(driveToken);
    }
  });
  client.requestAccessToken();
}

function loadAndOpenPicker(token) {
  if (!window.gapi) {
    setDriveModalError('Google API not loaded yet. Please try again.');
    return;
  }
  gapi.load('picker', () => {
    const view = new google.picker.DocsView()
      .setIncludeFolders(false)
      .setMimeTypes('application/vnd.google-apps.spreadsheet,application/vnd.google-apps.document');
    const builder = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setCallback(pickerCallback)
      .setTitle('Select output file');
    if (GOOGLE_API_KEY && GOOGLE_API_KEY !== 'YOUR_GOOGLE_API_KEY') {
      builder.setDeveloperKey(GOOGLE_API_KEY);
    }
    builder.build().setVisible(true);
    document.getElementById('modal-r').style.display = 'none';
  });
}

function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const doc = data.docs[0];
    driveFile = { id: doc.id, name: doc.name, mimeType: doc.mimeType };
    setDriveConnected();
  } else if (data.action === google.picker.Action.CANCEL) {
    if (!driveConnected) { driveToken = null; resetDriveModal(); }
  }
}

function setDriveConnected() {
  driveConnected = true;
  document.getElementById('driveUnconnectedZone').style.display = 'none';
  document.getElementById('driveConnectedZone').style.display = '';
  document.getElementById('bk-r').style.color = '';
  const shortName = driveFile.name.length > 18 ? driveFile.name.slice(0, 16) + '…' : driveFile.name;
  document.getElementById('driveFileName').textContent = shortName;
  document.getElementById('settingsDriveSub').textContent = driveFile.name;
  document.getElementById('settingsDriveRight').innerHTML =
    '<span class="conn-label">connected</span><button class="btn btn-sm" onclick="disconnectDrive()">Disconnect</button>';
  const footBtn = document.getElementById('driveFootBtn');
  footBtn.textContent = '↑ Drive'; footBtn.onclick = syncToDrive;
  document.getElementById('modal-r').style.display = 'none';
  resetDriveModal();
}

function disconnectDrive() {
  if (driveToken) google.accounts.oauth2.revoke(driveToken, () => {});
  driveConnected = false; driveToken = null; driveFile = null;
  document.getElementById('driveConnectedZone').style.display = 'none';
  document.getElementById('driveUnconnectedZone').style.display = '';
  document.getElementById('bk-r').style.color = '#D0CEC6';
  document.getElementById('settingsDriveSub').textContent = 'Not connected';
  document.getElementById('settingsDriveRight').innerHTML = '<button class="btn btn-sm" onclick="openDriveConnect()">Connect →</button>';
  const footBtn = document.getElementById('driveFootBtn');
  footBtn.textContent = 'Drive'; footBtn.onclick = openDriveConnect;
}

function openDriveConnect() {
  settings.style.display = 'none';
  document.getElementById('settingsBtn').classList.remove('active');
  if (!isExpanded) collapsed.style.display = 'flex'; else expanded.style.display = 'block';
  openModal('modal-r');
}

async function syncToDrive() {
  if (!driveConnected || !driveFile || !driveToken) return;
  const btn = document.getElementById('driveFootBtn');
  btn.disabled = true; btn.textContent = 'syncing…';
  try {
    const styleConfig = loadExportStyle();
    const grouped = gatherWineListData();
    const sections = resolveSectionConfig(styleConfig, grouped).filter(s => s.visible);
    if (driveFile.mimeType === 'application/vnd.google-apps.spreadsheet') {
      await writeWineListToSheet(sections, styleConfig);
    } else {
      await writeWineListToDoc(sections, styleConfig);
    }
    btn.textContent = '✓ synced';
    hasManualSynced = true; // user has explicitly chosen this target — auto-sync may arm
    updateAutoSyncBadge();
    setTimeout(() => { btn.textContent = '↑ Drive'; btn.disabled = false; }, 2500);
  } catch (e) {
    if (e.message === 'AUTH_EXPIRED') {
      disconnectDrive();
      btn.textContent = 'reconnect Drive'; btn.disabled = false; btn.onclick = connectDrive;
      return;
    }
    btn.textContent = 'error';
    setTimeout(() => { btn.textContent = '↑ Drive'; btn.disabled = false; }, 2500);
  }
}

function hexToRgb01(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

async function writeWineListToSheet(sections, styleConfig) {
  const values = [[styleConfig.title || 'Wine List', '', '']];
  const boldRowIndices = [0];
  sections.forEach(sec => {
    boldRowIndices.push(values.length);
    values.push([sec.category, '', '']);
    sec.items.forEach(it => {
      const sub = [it.size, styleConfig.showRegion && it.region].filter(Boolean).join(' \xb7 ');
      values.push([it.name, sub, '$' + formatPrice(it.price, styleConfig.decimalPrices)]);
    });
  });

  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${driveFile.id}/values/A1:C${values.length}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', headers: { Authorization: 'Bearer ' + driveToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) }
  );
  if (isAuthExpired(putRes)) throw new Error('AUTH_EXPIRED');

  // repeatCell formatting needs the sheetId (gid) of the first tab — same first-sheet
  // assumption the original unstyled sync already made.
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${driveFile.id}?fields=sheets.properties`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  const meta = await metaRes.json();
  const sheetId = meta.sheets?.[0]?.properties?.sheetId || 0;
  const accentHex = (COLOR_SWATCHES.find(c => c.id === styleConfig.colorId) || COLOR_SWATCHES[0]).hex;
  const accentRgb = hexToRgb01(accentHex);

  const requests = boldRowIndices.map(rowIdx => ({
    repeatCell: {
      range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
      cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: rowIdx === 0 ? {} : accentRgb } } },
      fields: 'userEnteredFormat.textFormat'
    }
  }));
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${driveFile.id}:batchUpdate`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + driveToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) }
  );
}

async function writeWineListToDoc(sections, styleConfig) {
  const metaRes = await fetch(`https://docs.googleapis.com/v1/documents/${driveFile.id}`, { headers: { Authorization: 'Bearer ' + driveToken } });
  if (isAuthExpired(metaRes)) throw new Error('AUTH_EXPIRED');
  const doc = await metaRes.json();
  const endIndex = doc.body?.content?.slice(-1)[0]?.endIndex || 1;

  const title = styleConfig.title || 'Wine List';
  let text = title + '\n\n';
  const boldRanges = [{ start: 0, end: title.length }];
  sections.forEach(sec => {
    const headStart = text.length;
    text += sec.category + '\n';
    boldRanges.push({ start: headStart, end: headStart + sec.category.length });
    sec.items.forEach(it => {
      const sub = [it.size, styleConfig.showRegion && it.region].filter(Boolean).join(' \xb7 ');
      text += `${it.name}\n${sub}  \xb7  $${formatPrice(it.price, styleConfig.decimalPrices)}\n\n`;
    });
  });

  const requests = [];
  if (endIndex > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  requests.push({ insertText: { location: { index: 1 }, text } });
  // bold ranges are relative to the inserted text, offset by the +1 leading index
  boldRanges.forEach(r => requests.push({
    updateTextStyle: {
      range: { startIndex: r.start + 1, endIndex: r.end + 1 },
      textStyle: { bold: true },
      fields: 'bold'
    }
  }));
  await fetch(`https://docs.googleapis.com/v1/documents/${driveFile.id}:batchUpdate`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + driveToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) }
  );
}


function setDriveModalLoading(msg) {
  document.getElementById('driveModalBody').innerHTML =
    '<div class="modal-status"><span class="auth-spinner"></span>' + esc(msg) + '</div>';
  document.getElementById('driveModalClose').disabled = true;
}

function setDriveModalError(msg) {
  document.getElementById('driveModalBody').innerHTML =
    '<div class="modal-error-msg">' + esc(msg) + '</div>' +
    '<div class="modal-opt" onclick="connectDrive()"><div><div class="mo-name">Google Drive</div><div class="mo-sub">Try again →</div></div></div>';
  document.getElementById('driveModalClose').disabled = false;
}

function resetDriveModal() {
  document.getElementById('driveModalHead').textContent = 'Output destination';
  document.getElementById('driveModalBody').innerHTML =
    '<div class="modal-opt" onclick="connectDrive()"><div><div class="mo-name">Google Drive</div><div class="mo-sub">Browse &amp; pick a file →</div></div></div>' +
    '<div class="modal-opt"><div><div class="mo-name">PDF export</div><div class="mo-sub">Download on demand</div></div></div>';
  document.getElementById('driveModalClose').disabled = false;
  document.getElementById('driveModalClose').textContent = 'Cancel';
}

// ─── HEADER SYNC BUTTON + AUTO-SYNC ──────────────────────────────────────────

function headerDriveSync(btn) {
  if (!driveConnected) {
    showToast('Connect Google Drive first — use the Drive button in the wine list footer');
    return;
  }
  btn.classList.add('spinning'); btn.disabled = true;
  Promise.resolve(syncToDrive()).finally(() => {
    btn.classList.remove('spinning'); btn.disabled = false;
  });
}

function updateAutoSyncBadge() {
  const on = getState().settings.autoSync && driveConnected && hasManualSynced;
  const badge = document.getElementById('autoSyncBadge');
  if (badge) badge.style.display = on ? '' : 'none';
}

function toggleAutoSync() {
  const st = getState();
  st.settings.autoSync = !st.settings.autoSync;
  saveAppState();
  document.getElementById('togAutoSync')?.classList.toggle('off', !st.settings.autoSync);
  updateAutoSyncBadge();
  showToast(st.settings.autoSync
    ? 'Auto-sync on — arms after your first manual Drive sync, then pushes changes automatically'
    : 'Auto-sync off');
}

// Debounced auto-sync: fires 3s after the last wine-list change, and never
// before the user has explicitly synced once (protects the target file).
window.addEventListener('vinline:changed', () => {
  if (!getState().settings.autoSync || !driveConnected || !hasManualSynced) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => syncToDrive(), 3000);
});

export {
  driveConnected, driveToken, driveFile,
  connectDrive, loadAndOpenPicker, pickerCallback, setDriveConnected, disconnectDrive,
  openDriveConnect, syncToDrive, hexToRgb01, writeWineListToSheet, writeWineListToDoc,
  setDriveModalLoading, setDriveModalError, resetDriveModal,
  headerDriveSync, toggleAutoSync, updateAutoSyncBadge
};
