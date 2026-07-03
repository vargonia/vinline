// ─── CREDENTIALS ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '389113702208-oikpagdsaqp1on4c87liosfl9tm044jv.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyDg4N-4bOs9HVLel6dLfnYzfErIT50It3c';
const MICROSOFT_CLIENT_ID = 'YOUR_AZURE_CLIENT_ID'; // Azure App Registration → replace when ready
const ANTHROPIC_API_KEY = ''; // set via serve.ps1 -AnthropicKey flag or browser prompt — never commit the real key
// When opened as file://, relative URLs break — point at the local proxy server instead
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
const msalConfig = {
  auth: {
    clientId: MICROSOFT_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: { cacheLocation: 'sessionStorage' }
};
// ─────────────────────────────────────────────────────────────────────────────

// EMAIL STATE
let emailConnected = false;
let emailProvider = null;
let emailAddress = '';
let gmailToken = null;
let outlookToken = null;
let _msalInstance = null;

// DRIVE STATE
let driveConnected = false;
let driveToken = null;
let driveFile = null; // { id, name, mimeType }

function isAuthExpired(res) { return res && res.status === 401; }

// UI REFS
const stage = document.getElementById('stage');
const collapsed = document.getElementById('collapsed');
const expanded = document.getElementById('expanded');
const settings = document.getElementById('settings');
const bkL = document.getElementById('bk-l');
const bkR = document.getElementById('bk-r');
const openHint = document.getElementById('openHint');
const colLeft = document.getElementById('colLeft');
const colRight = document.getElementById('colRight');
const divL = document.getElementById('divL');
const divR = document.getElementById('divR');
const shelves = Array.from({length:10}, (_,i) => document.getElementById('sl'+i));
const inboxBody = document.getElementById('inboxBody');
let isExpanded = false;
let rowCount = 0;
let currentExportStyle = null;

// MARGIN SYSTEM
const costs = [71, 12, 18, 15, 28];
const committed = [4.0, 4.0, 4.0, 4.0, 4.0];
const pending = [...committed];
let displayMode = 'mult';
const committedBtg = [false, false, false, false, false];
const pendingBtg   = [false, false, false, false, false];
const wlMap = [0, 1, 2, 3, 4];

// file cards → File objects (set when card is created, read when parse is triggered)
const fileCardMap = new Map();

// ─── EXPORT / PREVIEW STYLE PRESETS ──────────────────────────────────────────
const CAT_ORDER = ['Sparkling', 'White', 'Rosé', 'Orange', 'Red', 'Dessert', 'Sake', 'Vermouth', 'Other'];

const FONT_PAIRINGS = [
  { id: 'modern',   label: 'Modern',    head: "'DM Sans',sans-serif",           headWeight: 500, body: "'DM Mono',monospace" },
  { id: 'classic',  label: 'Classic',   head: "'Playfair Display',serif",       headWeight: 600, body: "'DM Sans',sans-serif" },
  { id: 'elegant',  label: 'Elegant',   head: "'Cormorant Garamond',serif",     headWeight: 500, body: "'DM Sans',sans-serif" },
  { id: 'mono',     label: 'Editorial', head: "'DM Mono',monospace",            headWeight: 400, body: "'DM Sans',sans-serif" },
];

const COLOR_SWATCHES = [
  { id: 'ink',      label: 'Ink',      hex: '#1C1B18' },
  { id: 'green',    label: 'Green',    hex: '#1A6B50' },
  { id: 'burgundy', label: 'Burgundy', hex: '#6B1A2B' },
  { id: 'charcoal', label: 'Charcoal', hex: '#33312C' },
  { id: 'gold',     label: 'Gold',     hex: '#9A7B2E' },
  { id: 'blue',     label: 'Blue',     hex: '#1A4A7A' },
];

const SPACING_PRESETS = { compact: { unit: '4px' }, cozy: { unit: '8px' }, spacious: { unit: '14px' } };

const COLUMN_OPTIONS = [{ value: 1, label: '1 column' }, { value: 2, label: '2 columns' }];
const SPACING_OPTIONS = [{ value: 'compact', label: 'Compact' }, { value: 'cozy', label: 'Cozy' }, { value: 'spacious', label: 'Spacious' }];
const PAPER_SIZE_OPTIONS = [{ value: 'letter', label: 'Letter' }, { value: 'a4', label: 'A4' }];

const EXPORT_STYLE_KEY = 'vinline_export_style_v1';

// ─── INVOICE PARSE PROMPT ────────────────────────────────────────────────────
const INVOICE_PARSE_PROMPT = `You are an expert at reading wine distributor invoices. Extract every wine line item and return a JSON array.

IMPORTANT — BOL WITHOUT PRICES: If the document is a Bill of Lading with NO price column (Garber & Company BOLs with "garberandcompany.com", Real Wine/Farm Cottage Wines BOLs with "realwineusa.biz", or any BOL that only shows Locations/Producer/Description/Vintage/Quantity with no cost column), return an empty array: []

If multiple invoices appear in one photo, parse ALL of them and combine into one array.

SKIP these line items:
- CRV / recycling deposits: any line with "CRV", "recycling", "deposit", "CA-CRV", "FEESCRV", "Misc Fee", "Non-Product Description", or price ≈ $0.10/unit
- Freight, delivery fees, split-case charges, "RECYCLING DEPOSIT CHANGE"
- Lime Ventures invoices sell beer/cans/non-wine — skip ALL items from Lime Ventures
- Any item with no price or $0 price

For each wine/sake/vermouth, return an object with exactly these fields:

"name": Display name — "Producer, WineName Vintage"
  • Proper title-case; preserve particles (d', di, de, del, les, la, le, von, etc.)
  • No alcohol%, DOC/IGT/AOC/appellation designations, bottle size, SKU codes, or importer name prefixes
  • If wine has a distinct named cuvée, add it in quotes: "Paltrinieri, Lambrusco \\"Pira\\" 2023"
  • Examples: "Lafon, Milly-Lamartine 2024" / "Cirelli, Orange NV" / "Akilia, Clarete 2023" / "Folk Machine, Grenache 2023" / "Ramey, Claret North Coast 2022" / "Chermette, Beaujolais Origine 2024" / "Sunier, Régnié 2023"

"vintage": Year string ("2024") or "NV". null only if completely unknown.

"size": Bottle size e.g. "750ml", "1L", "500ml", "300ml", "720ml". Default "750ml".

"qty_bottles": Total BOTTLES as integer. Derive from cases × bottles_per_case.
  Get bottles_per_case from PACK/SIZE/FORMAT column:
  "12/750ml" or "12x750" → 12 | "6/750ml" or "6x750" → 6 | "6x720" → 6 | "15x300" → 15 | "24/375ml" → 24 | "1/1.5L" → 1
  If QTY is fractional cases (Grapevine), round(QTY × bottles_per_case).

"cost_per_bottle": Per-bottle wholesale cost, decimal, 2 decimal places, no $ sign.

"region": Human-readable e.g. "Beaujolais, France" / "Loire Valley, France" / "Etna, Sicily" / "Lambrusco, Italy" / "Sta. Rita Hills, California" / "Austria" / "Jerez, Spain". Infer from appellation/grape/producer origin.

"category": Exactly one of: "Sparkling", "White", "Rosé", "Orange", "Red", "Dessert", "Sake", "Vermouth"
  Sparkling: Champagne, Crémant, Cava, Prosecco, Pétillant Naturel, sparkling/mousseux/sekt
  White: Chardonnay, Sauvignon Blanc, Pinot Gris/Grigio, Riesling, Grüner Veltliner, Muscadet, Sancerre, Mâcon, Soave, Verdicchio, Blaufränkisch Weiss, white Burgundy/Bordeaux, Fino/Manzanilla Sherry
  Rosé: pink/rosé wines
  Orange: skin-contact/amber wines — look for "orange", "skin contact", "ramato", "skin-fermented", "amber"
  Red: red grapes or red appellations (Burgundy, Barolo, Rioja, Beaujolais, Grenache, Syrah, etc.)
  Dessert: late-harvest, Sauternes, Port, Oloroso/Amontillado/Pedro Ximénez Sherry, Madeira, ice wine
  Sake: any Japanese rice wine (Junmai, Daiginjo, Honjozo, etc.)
  Vermouth: any vermouth product
  Default "Red" if ambiguous.

━━━ DISTRIBUTOR-SPECIFIC RULES ━━━

BEAUNE IMPORTS (dot-matrix paper, header "Beaune Imports", columns QTY/ITEM/UNIT PRICE/DISC%/TAX/TOTAL):
  • ITEM format: "SKU# — VINTAGE Appellation, Producer" → name = "Producer, Appellation VINTAGE"
  • QTY = cases (12 bottles each). UNIT PRICE = per-case.
  • cost_per_bottle = UNIT_PRICE × (1 − DISC%/100) / 12
  • Skip "CA-CRV2" line

LYRA FINE WINE (header "LYRA Fine Wine Importers", columns QTY/PACK/CODE/ITEM/UNIT PRICE/DISC%/TOTAL):
  • ITEM format: "Producer, CuveeName AppellationType VINTAGE - X% alc by vol"
  • QTY = cases. UNIT PRICE = per-case. cost_per_bottle = UNIT_PRICE × (1 − DISC%/100) / 12
  • Skip FEESCRV line

DANCH & GRANGER SELECTIONS (header "Danch and Granger Selections", columns QTY/PACK/CODE/ITEM/UNIT PRICE/DISC%/TOTAL):
  • ITEM format: "VINTAGE Producer WineName VINTAGE size/pack" — strip trailing size/pack info
  • QTY = cases. UNIT PRICE = per-case. cost_per_bottle = UNIT_PRICE × (1 − DISC%/100) / 12
  • Skip "CA CRV /Bottle" line

GRAPEVINE WINE BROKERS (header "GRAPEVINE WINE BROKERS", columns QTY/PACK/CODE/ITEM/UNIT PRICE/BTL PRICE/DISC%/TOTAL):
  • Has BTL PRICE column — use that directly for cost_per_bottle
  • ITEM is ALL-CAPS "VINTAGE PRODUCER APPELLATION CUVÉE" — normalize capitalization
  • Skip GWBCRVBTL / "CA CRV BOTTLE" line

CHAMBERS & CHAMBERS (header "CHAMBERS & CHAMBERS WINE MERCHANTS", columns PRODUCT CODE/DESCRIPTION/SIZE/QTY SHIPPED/LIST PRICE/DISC.%/DISC.$/NET UNIT PRICE/EXTENSION):
  • SIZE column gives pack: "12x750"→12, "6x750"→6, "6x720"→6, "15x300"→15
  • cost_per_bottle = NET UNIT PRICE / bottles_per_case (NET already after discount)
  • qty_bottles = QTY SHIPPED (CASES column) × bottles_per_case
  • Wakatake/Ohyama/any "Junmai/Daiginjo" items → category "Sake"
  • Sorso Vermouth or any vermouth → category "Vermouth"
  • Alvear Fino/any Fino/Manzanilla Sherry → category "White"
  • Skip CRV entries (shown separately below each wine line)

SKURNIK (BOL on yellow paper, columns LINE/ITEM NO/QTY/SOM/DESCRIPTION/CASES PACKS/LIST UNIT PRICE/DISC%/NET CASE PRICE/NET BTL PRICE/AMOUNT):
  • NET BTL PRICE column = cost_per_bottle (use directly)
  • If NET BTL PRICE missing, use NET CASE / bottles_per_case
  • Skip "RECYCLING DEPOSIT CHANGE" / split-case lines

ALLUVIAL WINES & SPIRITS / HOBO WINE CO (REVEL WINE) / ELENTENY IMPORTS — SAME FORMAT:
  • Identified by: "INVOICE No AW#####", "INVOICE No ######", or "INVOICE No INV######" in header
  • Columns: Product Description | Bottles | Cases | Case Price | Total
  • cost_per_bottle = Case Price / bottles_per_case (get bottles_per_case from "[750 mL@12/c]" style in description)
  • qty_bottles = Cases × bottles_per_case
  • Description format: "[Optional brand/importer prefix] VINTAGE Producer WineName [size@N/c] [nickname] Item # CODE"
    Strip leading brand prefix (e.g. "Mission Wine Merchants", "Folk Machine 2023 Folk Machine", "Hobo Wine Co")
    Extract: vintage, producer name, wine name
  • Skip "Non-Product Description" CRV lines ("Misc Fee - CA CRV", "Misc Fee - Hobo CRV", etc.)

GARBER & COMPANY BOL (header "BOL: Delivery", sold by garberandcompany.com, columns: Locations/ID#/Format/#/c/Producer/Description/Vintage/Varietal/Quantity — NO PRICE COLUMN):
  • Return []

REAL WINE / FARM COTTAGE WINES BOL (header "BOL: Delivery", sold by realwineusa.biz, columns: Locations/SD#/Format/#s/Producer/Description/Vintage/Varietal/Quantity — NO PRICE COLUMN):
  • Return []

Return ONLY a valid JSON array with no other text, markdown, or explanation:
[{"name":"...","vintage":"...","size":"750ml","qty_bottles":12,"cost_per_bottle":18.50,"region":"...","category":"Red"}]`;

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

// ─── EMAIL AUTH ───────────────────────────────────────────────────────────────

function connectGmail() {
  if (!window.google?.accounts?.oauth2) {
    setModalError('Google sign-in is still loading. Please try again in a moment.');
    return;
  }
  setModalLoading('Opening Google sign-in…');
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    callback: async (response) => {
      if (response.error) {
        setModalError(response.error === 'access_denied' ? 'Access denied. Please try again.' : 'Sign-in failed: ' + response.error);
        return;
      }
      gmailToken = response.access_token;
      setModalLoading('Fetching account info…');
      try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: 'Bearer ' + response.access_token }
        });
        const user = await userRes.json();
        setEmailConnected('Gmail', user.email || 'gmail account');
      } catch (e) {
        setEmailConnected('Gmail', 'gmail account');
      }
    }
  });
  client.requestAccessToken();
}

async function connectOutlook() {
  if (!window.msal) {
    setModalError('Microsoft sign-in is still loading. Please try again in a moment.');
    return;
  }
  if (!MICROSOFT_CLIENT_ID || MICROSOFT_CLIENT_ID === 'YOUR_AZURE_CLIENT_ID') {
    setModalError('Outlook not configured yet — Azure client ID needed. See Obsidian setup docs.');
    return;
  }
  setModalLoading('Opening Microsoft sign-in…');
  try {
    if (!_msalInstance) {
      _msalInstance = new msal.PublicClientApplication(msalConfig);
      await _msalInstance.initialize();
    }
    const tokenResponse = await _msalInstance.acquireTokenPopup({
      scopes: ['openid', 'profile', 'User.Read', 'Mail.Read'],
      prompt: 'select_account'
    });
    outlookToken = tokenResponse.accessToken;
    const account = _msalInstance.getAllAccounts()[0];
    const email = account?.username || 'outlook account';
    setEmailConnected('Outlook', email);
  } catch (e) {
    if (e.errorCode === 'user_cancelled' || e.name === 'BrowserAuthError') {
      resetEmailModal();
    } else {
      setModalError('Sign-in failed: ' + (e.errorMessage || e.message || 'unknown error'));
    }
  }
}

function setEmailConnected(provider, email) {
  emailConnected = true;
  emailProvider = provider;
  emailAddress = email;

  // Update left bracket: hide unconnected, show connected
  document.getElementById('emailUnconnectedZone').style.display = 'none';
  document.getElementById('emailConnectedZone').style.display = '';
  const shortEmail = email.length > 16 ? email.split('@')[0] + '\n@' + email.split('@')[1] : email;
  document.getElementById('emailDisplayName').textContent = shortEmail;
  document.getElementById('emailProviderLabel').textContent = provider;

  // Update topbar badge
  document.getElementById('topbarStatus').style.display = 'flex';
  document.getElementById('topbarStatusText').textContent = email.split('@')[0];

  // Update settings panel for the correct provider
  if (provider === 'Gmail') {
    document.getElementById('settingsGmailSub').textContent = email;
    document.getElementById('settingsGmailRight').innerHTML = '<span class="conn-label">connected</span><button class="btn btn-sm" onclick="disconnectGmail()">Disconnect</button>';
  } else {
    document.getElementById('settingsOutlookSub').textContent = email;
    document.getElementById('settingsOutlookRight').innerHTML = '<span class="conn-label">connected</span><button class="btn btn-sm" onclick="disconnectOutlook()">Disconnect</button>';
  }

  // Close modal, start scan
  closeModal('modal-l');
  setOpenHintScanning();
  showInboxScanning();
  if (provider === 'Gmail') {
    scanInbox(gmailToken);
  } else {
    scanOutlookInbox(outlookToken);
  }
}

function resetGmailConnectionUI() {
  gmailToken = null; emailConnected = false; emailProvider = null; emailAddress = '';
  document.getElementById('emailUnconnectedZone').style.display = '';
  document.getElementById('emailConnectedZone').style.display = 'none';
  document.getElementById('topbarStatus').style.display = 'none';
  document.getElementById('settingsGmailSub').textContent = 'Not connected';
  document.getElementById('settingsGmailRight').innerHTML = '<button class="btn btn-sm" onclick="openEmailConnect(\'Gmail\')">Connect →</button>';
}

function disconnectGmail() {
  if (gmailToken) google.accounts.oauth2.revoke(gmailToken, () => {});
  resetGmailConnectionUI();
  openHint.innerHTML = '↓ tap to open';
  showInboxEmpty();
  document.getElementById('inboxCount').textContent = '—';
}

function disconnectOutlook() {
  outlookToken = null; _msalInstance = null;
  if (emailProvider === 'Outlook') {
    emailConnected = false; emailProvider = null; emailAddress = '';
    document.getElementById('emailUnconnectedZone').style.display = '';
    document.getElementById('emailConnectedZone').style.display = 'none';
    document.getElementById('topbarStatus').style.display = 'none';
    openHint.innerHTML = '↓ tap to open';
    showInboxEmpty();
    document.getElementById('inboxCount').textContent = '—';
  }
  document.getElementById('settingsOutlookSub').textContent = 'Not connected';
  document.getElementById('settingsOutlookRight').innerHTML = '<button class="btn btn-sm" onclick="openEmailConnect(\'Outlook\')">Connect →</button>';
}

function openEmailConnect(provider) {
  // From settings: collapse back and open the email modal
  settings.style.display = 'none';
  document.getElementById('settingsBtn').classList.remove('active');
  if (!isExpanded) collapsed.style.display = 'flex'; else expanded.style.display = 'block';
  openModal('modal-l');
}

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

// ─── EXPORT STYLE PERSISTENCE ─────────────────────────────────────────────────

function defaultExportStyle() {
  return {
    title: 'Wine List', subtitle: '',
    logoDataUrl: null, logoEnabled: false,
    fontPairingId: 'classic', colorId: 'ink',
    columns: 1, spacing: 'cozy', paperSize: 'letter',
    showRegion: true, decimalPrices: false,
    sectionOrder: [], sectionVisible: {}
  };
}

function loadExportStyle() {
  try {
    const raw = localStorage.getItem(EXPORT_STYLE_KEY);
    if (!raw) return defaultExportStyle();
    return { ...defaultExportStyle(), ...JSON.parse(raw) };
  } catch (e) {
    return defaultExportStyle();
  }
}

function saveExportStyle(config) {
  try {
    localStorage.setItem(EXPORT_STYLE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    return false;
  }
}

// Single source of truth for section order + visibility — used identically by
// the PDF/preview renderer and the Drive push so they can never disagree.
function resolveSectionConfig(styleConfig, groupedData) {
  const present = new Set(groupedData.map(g => g.category));
  const known = styleConfig.sectionOrder.filter(c => present.has(c));
  const unknown = CAT_ORDER.filter(c => present.has(c) && !known.includes(c));
  const order = [...known, ...unknown];
  return order.map(cat => ({
    category: cat,
    items: groupedData.find(g => g.category === cat)?.items || [],
    visible: styleConfig.sectionVisible[cat] !== false
  }));
}

// ─── DOCUMENT RENDERER (shared by live preview pane and print) ───────────────

function formatPrice(price, decimal) {
  const n = parseFloat(price) || 0;
  return decimal ? n.toFixed(2) : Math.round(n).toString();
}

function buildSubLine(item, styleConfig) {
  const parts = [item.size, styleConfig.showRegion && item.region].filter(Boolean);
  return esc(parts.join(' \xb7 '));
}

function renderWineListDoc(styleConfig) {
  const grouped = gatherWineListData();
  const sections = resolveSectionConfig(styleConfig, grouped).filter(s => s.visible);

  if (!sections.length) {
    return '<div class="preview-empty">No wine list items yet — push inventory to the wine list first.</div>';
  }

  const headerHtml = `
    <div class="doc-header">
      ${styleConfig.logoEnabled && styleConfig.logoDataUrl ? `<img class="doc-logo" src="${styleConfig.logoDataUrl}" alt="">` : ''}
      <div class="doc-title">${esc(styleConfig.title || 'Wine List')}</div>
      ${styleConfig.subtitle ? `<div class="doc-subtitle">${esc(styleConfig.subtitle)}</div>` : ''}
    </div>`;

  const sectionsHtml = sections.map(sec => `
    <div class="doc-section">
      <div class="doc-section-head">${esc(sec.category)}</div>
      ${sec.items.map(it => `
        <div class="doc-item">
          <div class="doc-item-left">
            <div class="doc-item-name">${esc(it.name)}</div>
            <div class="doc-item-sub">${buildSubLine(it, styleConfig)}</div>
          </div>
          <div class="doc-item-price">$${formatPrice(it.price, styleConfig.decimalPrices)}</div>
        </div>`).join('')}
    </div>`).join('');

  return `${headerHtml}<div class="doc-columns doc-cols-${styleConfig.columns}">${sectionsHtml}</div>`;
}

function applyDocStyleVars(paperEl, styleConfig) {
  const pairing = FONT_PAIRINGS.find(f => f.id === styleConfig.fontPairingId) || FONT_PAIRINGS[0];
  const color = COLOR_SWATCHES.find(c => c.id === styleConfig.colorId) || COLOR_SWATCHES[0];
  paperEl.style.setProperty('--doc-font-head', pairing.head);
  paperEl.style.setProperty('--doc-font-head-weight', pairing.headWeight);
  paperEl.style.setProperty('--doc-font-body', pairing.body);
  paperEl.style.setProperty('--doc-accent', color.hex);
  paperEl.style.setProperty('--doc-spacing-unit', SPACING_PRESETS[styleConfig.spacing].unit);
  paperEl.classList.toggle('doc-a4', styleConfig.paperSize === 'a4');
}

// ─── PREVIEW / STYLE EDITOR ───────────────────────────────────────────────────

function openPreviewEditor() {
  currentExportStyle = loadExportStyle();
  populatePreviewPanel(currentExportStyle);
  refreshPreviewPane();
  document.getElementById('previewOverlay').style.display = 'flex';
}

function closePreviewEditor() {
  document.getElementById('previewOverlay').style.display = 'none';
}

function refreshPreviewPane() {
  const paper = document.getElementById('previewPaper');
  paper.innerHTML = renderWineListDoc(currentExportStyle);
  applyDocStyleVars(paper, currentExportStyle);
  const exportBtn = document.getElementById('exportPdfBtn');
  if (exportBtn) exportBtn.disabled = !gatherWineListData().length;
}

function populatePreviewPanel(styleConfig) {
  document.getElementById('exportTitleInput').value = styleConfig.title;
  document.getElementById('exportSubtitleInput').value = styleConfig.subtitle;
  renderColorSwatches(styleConfig);
  renderFontPairings(styleConfig);
  renderPillRow('columnsPillRow', COLUMN_OPTIONS, styleConfig.columns, 'setColumns');
  renderPillRow('spacingPillRow', SPACING_OPTIONS, styleConfig.spacing, 'setSpacing');
  renderPillRow('paperSizePillRow', PAPER_SIZE_OPTIONS, styleConfig.paperSize, 'setPaperSize');
  document.getElementById('togRegion').classList.toggle('off', !styleConfig.showRegion);
  document.getElementById('togDecimal').classList.toggle('off', !styleConfig.decimalPrices);
  renderLogoDropzone(styleConfig);
  renderSectionDragList(styleConfig);
}

function renderPillRow(containerId, options, current, setterName) {
  const el = document.getElementById(containerId);
  el.innerHTML = options.map(o => {
    const arg = typeof o.value === 'number' ? o.value : `'${o.value}'`;
    return `<button class="pill-btn ${String(o.value) === String(current) ? 'active' : ''}" onclick="${setterName}(${arg})">${esc(o.label)}</button>`;
  }).join('');
}

function renderColorSwatches(styleConfig) {
  document.getElementById('colorSwatchGrid').innerHTML = COLOR_SWATCHES.map(c =>
    `<button class="swatch-opt ${c.id === styleConfig.colorId ? 'active' : ''}" style="background:${c.hex}" title="${esc(c.label)}" aria-label="${esc(c.label)}" onclick="setColorSwatch('${c.id}')"></button>`
  ).join('');
}

function renderFontPairings(styleConfig) {
  document.getElementById('fontPairGrid').innerHTML = FONT_PAIRINGS.map(f =>
    `<div class="font-pair-card ${f.id === styleConfig.fontPairingId ? 'active' : ''}" onclick="setFontPairing('${f.id}')">
      <span class="font-pair-sample" style="font-family:${f.head};font-weight:${f.headWeight}">Aa</span>
      <span class="font-pair-label">${esc(f.label)}</span>
    </div>`
  ).join('');
}

function setExportTitle(value) { currentExportStyle.title = value; saveExportStyle(currentExportStyle); refreshPreviewPane(); }
function setExportSubtitle(value) { currentExportStyle.subtitle = value; saveExportStyle(currentExportStyle); refreshPreviewPane(); }

function setFontPairing(id) {
  currentExportStyle.fontPairingId = id;
  saveExportStyle(currentExportStyle);
  renderFontPairings(currentExportStyle);
  refreshPreviewPane();
}
function setColorSwatch(id) {
  currentExportStyle.colorId = id;
  saveExportStyle(currentExportStyle);
  renderColorSwatches(currentExportStyle);
  refreshPreviewPane();
}
function setColumns(n) {
  currentExportStyle.columns = n;
  saveExportStyle(currentExportStyle);
  renderPillRow('columnsPillRow', COLUMN_OPTIONS, n, 'setColumns');
  refreshPreviewPane();
}
function setSpacing(id) {
  currentExportStyle.spacing = id;
  saveExportStyle(currentExportStyle);
  renderPillRow('spacingPillRow', SPACING_OPTIONS, id, 'setSpacing');
  refreshPreviewPane();
}
function setPaperSize(id) {
  currentExportStyle.paperSize = id;
  saveExportStyle(currentExportStyle);
  renderPillRow('paperSizePillRow', PAPER_SIZE_OPTIONS, id, 'setPaperSize');
  refreshPreviewPane();
}
function toggleShowRegion() {
  currentExportStyle.showRegion = !currentExportStyle.showRegion;
  saveExportStyle(currentExportStyle);
  document.getElementById('togRegion').classList.toggle('off', !currentExportStyle.showRegion);
  refreshPreviewPane();
}
function toggleDecimalPrices() {
  currentExportStyle.decimalPrices = !currentExportStyle.decimalPrices;
  saveExportStyle(currentExportStyle);
  document.getElementById('togDecimal').classList.toggle('off', !currentExportStyle.decimalPrices);
  refreshPreviewPane();
}

// ─── SECTION DRAG-LIST ────────────────────────────────────────────────────────

const dragHandleSvg = `<svg class="drag-handle" width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="2" y1="3.5" x2="10" y2="3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><line x1="2" y1="8.5" x2="10" y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;

function renderSectionDragList(styleConfig) {
  const grouped = gatherWineListData();
  const sections = resolveSectionConfig(styleConfig, grouped);
  document.getElementById('sectionDragList').innerHTML = sections.map(s => `
    <div class="section-drag-item" draggable="true" data-cat="${esc(s.category)}"
         ondragstart="onSectionDragStart(event)" ondragover="onSectionDragOver(event)"
         ondrop="onSectionDrop(event)" ondragend="onSectionDragEnd(event)">
      ${dragHandleSvg}
      <span class="section-drag-name${s.visible ? '' : ' hidden-section'}">${esc(s.category)}</span>
      <button class="tog ${s.visible ? '' : 'off'}" onclick="toggleSectionVisible('${esc(s.category)}')" aria-label="toggle ${esc(s.category)} visibility"></button>
    </div>`).join('');
}

let dragSrcCat = null;

function onSectionDragStart(e) {
  dragSrcCat = e.currentTarget.dataset.cat;
  e.currentTarget.classList.add('dragging');
}
function onSectionDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}
function onSectionDrop(e) {
  e.preventDefault();
  const targetCat = e.currentTarget.dataset.cat;
  e.currentTarget.classList.remove('drag-over');
  if (dragSrcCat && dragSrcCat !== targetCat) reorderSection(dragSrcCat, targetCat);
}
function onSectionDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.section-drag-item.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function reorderSection(srcCat, targetCat) {
  const grouped = gatherWineListData();
  const sections = resolveSectionConfig(currentExportStyle, grouped);
  const order = sections.map(s => s.category);
  order.splice(order.indexOf(targetCat), 0, ...order.splice(order.indexOf(srcCat), 1));
  currentExportStyle.sectionOrder = order;
  saveExportStyle(currentExportStyle);
  renderSectionDragList(currentExportStyle);
  refreshPreviewPane();
}

function toggleSectionVisible(category) {
  currentExportStyle.sectionVisible[category] = !(currentExportStyle.sectionVisible[category] !== false);
  saveExportStyle(currentExportStyle);
  renderSectionDragList(currentExportStyle);
  refreshPreviewPane();
}

// ─── LOGO UPLOAD ──────────────────────────────────────────────────────────────

function renderLogoDropzone(styleConfig, errorMsg) {
  const inner = document.getElementById('logoDropzoneInner');
  if (errorMsg) {
    inner.innerHTML = `<div class="logo-dropzone-hint" style="color:var(--red)">${esc(errorMsg)}</div>`;
    return;
  }
  if (styleConfig.logoEnabled && styleConfig.logoDataUrl) {
    inner.innerHTML = `<img class="logo-thumb" src="${styleConfig.logoDataUrl}" alt=""><span class="logo-remove" onclick="event.stopPropagation();removeLogo()">Remove logo</span>`;
  } else {
    inner.innerHTML = `<div class="logo-dropzone-hint">Click to add a logo</div>`;
  }
}

async function handleLogoUpload(fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const { base64, mediaType } = await imageToBase64(file, 400);
    const dataUrl = `data:${mediaType};base64,${base64}`;
    currentExportStyle.logoDataUrl = dataUrl;
    currentExportStyle.logoEnabled = true;
    if (!saveExportStyle(currentExportStyle)) {
      currentExportStyle.logoDataUrl = null;
      currentExportStyle.logoEnabled = false;
      renderLogoDropzone(currentExportStyle, 'Logo too large to save — try a smaller image.');
      return;
    }
    renderLogoDropzone(currentExportStyle);
    refreshPreviewPane();
  } catch (e) {
    renderLogoDropzone(currentExportStyle, e.message || 'Could not read image file.');
  } finally {
    fileInput.value = '';
  }
}

function removeLogo() {
  currentExportStyle.logoDataUrl = null;
  currentExportStyle.logoEnabled = false;
  saveExportStyle(currentExportStyle);
  renderLogoDropzone(currentExportStyle);
  refreshPreviewPane();
}

// ─── PRINT / PDF EXPORT ───────────────────────────────────────────────────────

function printWineListDoc(styleConfig) {
  if (!gatherWineListData().length) return;
  const overlay = document.getElementById('previewOverlay');
  const wasOpen = overlay.style.display === 'flex';
  const paper = document.getElementById('previewPaper');
  paper.innerHTML = renderWineListDoc(styleConfig);
  applyDocStyleVars(paper, styleConfig);
  document.getElementById('pageSizeStyle').textContent =
    `@page { size: ${styleConfig.paperSize === 'a4' ? 'A4' : 'letter'}; margin: 0.5in; }`;
  if (!wasOpen) overlay.style.display = 'flex';
  window.addEventListener('afterprint', function restore() {
    if (!wasOpen) overlay.style.display = 'none';
  }, { once: true });
  window.print();
}

function exportPdfFromEditor() {
  saveExportStyle(currentExportStyle);
  printWineListDoc(currentExportStyle);
}

function quickExportPdf() {
  printWineListDoc(loadExportStyle());
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
  if (!emailConnected) return;
  btn.classList.add('spinning'); btn.disabled = true;
  setOpenHintScanning(); showInboxScanning();
  if (emailProvider === 'Gmail') {
    await scanInbox(gmailToken);
  } else {
    await scanOutlookInbox(outlookToken);
  }
  btn.classList.remove('spinning'); btn.disabled = false;
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

function showDemoCards() {
  inboxBody.innerHTML = `
    <div class="ecard sel" style="z-index:10;position:relative">
      <div class="ec-from">Southern Wine &amp; Spirits</div>
      <div class="ec-subj">Invoice #8821 — June delivery confirmed</div>
      <div class="ec-foot"><span class="ec-date">Today 9:14</span><span class="badge b-inv">Invoice</span></div>
      <div class="inv-popup">
        <div class="popup-head"><div class="popup-from">Southern Wine &amp; Spirits</div><div class="popup-inv"><span>Invoice #8821</span><span>12 Dec 2024</span></div></div>
        <div class="popup-body"><div class="popup-lbl">Contents</div>
          <div class="popup-row"><div><div class="popup-wine">Richard Leroy, Anjou</div><span class="popup-wine-sub">"Les Noëls de Montbenault" 2020</span></div><div class="popup-right"><span class="popup-qty">3 btl</span><span class="popup-price">$71/btl</span></div></div>
          <div class="popup-row"><div><div class="popup-wine">La Ca'Nova, Barbera d'Alba</div><span class="popup-wine-sub">"Loreto" 2021</span></div><div class="popup-right"><span class="popup-qty">84 btl</span><span class="popup-price">$18/btl</span></div></div>
          <div class="popup-row"><div><div class="popup-wine">Champagne Herbert Beaufort</div><span class="popup-wine-sub">"Carte d'Or" Grand Cru NV</span></div><div class="popup-right"><span class="popup-qty">12 btl</span><span class="popup-price">$36/btl</span></div></div>
        </div>
        <div class="popup-foot"><span class="popup-total-lbl">Invoice total</span><span class="popup-total">$1,763.00</span></div>
      </div>
    </div>
    <div class="ecard" style="z-index:9">
      <div class="ec-from">Grapevine Wine Brokers</div>
      <div class="ec-subj">Invoice #22197 — December order</div>
      <div class="ec-foot"><span class="ec-date">Today 8:02</span><span class="badge b-inv">Invoice</span></div>
    </div>
    <div class="ecard" style="z-index:8">
      <div class="ec-from">Skurnik Wines West</div>
      <div class="ec-subj">Bill of Lading #0215104</div>
      <div class="ec-foot"><span class="ec-date">Yesterday</span><span class="badge b-del">Delivery</span></div>
    </div>
    <div class="ecard" style="z-index:7">
      <div class="ec-from">Lyra Fine Wine Importers</div>
      <div class="ec-subj">Invoice #36327 — Feb delivery</div>
      <div class="ec-foot"><span class="ec-date">Feb 21</span><span class="badge b-pend">Pending</span></div>
    </div>`;
  document.getElementById('inboxCount').textContent = '4 items';
  setOpenHintReady(4);
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
  document.getElementById('emailModalClose').disabled = true;
}

function setModalError(msg) {
  document.getElementById('emailModalBody').innerHTML =
    '<div class="modal-error-msg">' + esc(msg) + '</div>' +
    '<div class="modal-opt" onclick="connectGmail()"><div><div class="mo-name">Gmail</div><div class="mo-sub">Try again →</div></div></div>' +
    '<div class="modal-opt" onclick="connectOutlook()"><div><div class="mo-name">Outlook</div><div class="mo-sub">Try again →</div></div></div>';
  document.getElementById('emailModalClose').disabled = false;
}

function resetEmailModal() {
  document.getElementById('emailModalHead').textContent = 'Connect inbox';
  document.getElementById('emailModalBody').innerHTML =
    '<div class="modal-opt" onclick="connectGmail()"><div><div class="mo-name">Gmail</div><div class="mo-sub">Sign in with Google →</div></div></div>' +
    '<div class="modal-opt" onclick="connectOutlook()"><div><div class="mo-name">Outlook</div><div class="mo-sub">Sign in with Microsoft →</div></div></div>' +
    '<div class="modal-opt" onclick="uploadInvoiceFile()"><div><div class="mo-name">Invoice file</div><div class="mo-sub">Upload PDF or photo →</div></div></div>';
  document.getElementById('emailModalClose').disabled = false;
  document.getElementById('emailModalClose').textContent = 'Cancel';
}

// ─── MODALS ───────────────────────────────────────────────────────────────────

function openModal(id) {
  const scene = document.getElementById('scene');
  document.querySelectorAll('.conn-modal').forEach(m => {
    m.style.display = 'none';
    m.style.position = '';
    m.style.top = '';
    m.style.left = '';
    m.style.right = '';
    if (m.parentElement !== scene) scene.appendChild(m);
  });
  document.getElementById(id).style.display = 'block';
}
function closeModal(id) {
  const el = document.getElementById(id);
  el.style.display = 'none';
  el.style.position = '';
  el.style.top = '';
  el.style.left = '';
  el.style.right = '';
  if (id === 'modal-l') {
    resetEmailModal();
    const scene = document.getElementById('scene');
    if (el.parentElement !== scene) scene.appendChild(el);
  }
  if (id === 'modal-r') resetDriveModal();
}

// Scene click: close modals, expand if clicking the center shelf area
document.getElementById('scene').addEventListener('click', e => {
  document.querySelectorAll('.conn-modal').forEach(m => m.style.display='none');
  if (!e.target.closest('.b-info') && !e.target.closest('.b-empty') && !e.target.closest('.conn-modal')) expand();
});
document.getElementById('openHint').addEventListener('click', expand);

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

// ─── FILE PARSE FLOW ─────────────────────────────────────────────────────────

function pdfToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize photo invoices to max 2048px (cuts cost + latency), reject HEIC
function imageToBase64(file, maxPx = 2048) {
  return new Promise((resolve, reject) => {
    const type = file.type || '';
    const name = (file.name || '').toLowerCase();
    if (type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
      return reject(new Error('HEIC format not supported by Claude. In Photos, tap Share → Save as JPEG, then upload that file.'));
    }
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale === 1 && (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp')) {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: type });
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ base64: canvas.toDataURL('image/jpeg', 0.92).split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Could not read image file.')); };
    img.src = blobUrl;
  });
}

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

// ─── SYNC BUTTON ──────────────────────────────────────────────────────────────

function syncBtn(btn) { btn.classList.add('spinning'); btn.disabled=true; setTimeout(()=>{btn.classList.remove('spinning');btn.disabled=false;},700); }

// ─── ANIMATION HELPERS ────────────────────────────────────────────────────────

function sI(el, s) { el.style.transition='none'; Object.assign(el.style, s); }

function visibleBInfos() {
  return [...document.querySelectorAll('.b-info, .b-empty')].filter(el => el.style.display !== 'none');
}

function expand() {
  if (isExpanded) return; isExpanded = true;
  collapsed.style.pointerEvents = 'none';
  document.querySelectorAll('.conn-modal').forEach(m => m.style.display='none');
  const bInfos = visibleBInfos();
  bInfos.forEach(el => { el.style.transition='opacity 0.18s ease'; el.style.opacity='0'; });
  openHint.style.transition='opacity 0.15s ease'; openHint.style.opacity='0';
  shelves.forEach((sl,i) => {
    setTimeout(() => { sl.style.transition='all 0.3s ease'; sl.style.transform='scaleX(1.5)'; sl.style.opacity='0.4'; }, i*24);
    setTimeout(() => { sl.style.transition='all 0.2s ease'; sl.style.transform='scaleX(0)'; sl.style.opacity='0'; sl.style.height='0px'; sl.style.marginBottom='0'; }, i*24+200);
  });
  const shelfDone = 9*24+200+210;
  setTimeout(() => {
    bkL.style.transition='all 0.48s cubic-bezier(0.4,0,0.2,1)'; bkR.style.transition='all 0.48s cubic-bezier(0.4,0,0.2,1)';
    bkL.style.transform='scaleY(7) scaleX(0.13)'; bkL.style.opacity='0.1';
    bkR.style.transform='scaleY(7) scaleX(0.13)'; bkR.style.opacity='0.1';
  }, shelfDone-140);
  const startH = stage.scrollHeight; stage.style.height = startH+'px';
  setTimeout(() => {
    const ecards = [...document.querySelectorAll('.ecard')];
    const invRows = [...document.querySelectorAll('.inv-row')];
    collapsed.style.display = 'none';
    sI(bkL,{transform:'',opacity:'1',transition:''}); sI(bkR,{transform:'',opacity:'1',transition:''});
    shelves.forEach(sl => sI(sl,{transform:'',opacity:'1',height:'',marginBottom:''}));
    bInfos.forEach(el => { el.style.transition='none'; el.style.opacity='1'; });
    openHint.style.transition='none'; openHint.style.opacity='1';
    collapsed.style.pointerEvents = '';
    expanded.style.display = 'block';
    sI(divL,{opacity:'0',transform:'scaleY(0)',transformOrigin:'top center'});
    sI(divR,{opacity:'0',transform:'scaleY(0)',transformOrigin:'top center'});
    sI(colLeft,{opacity:'0',transform:'translateX(-18px)'});
    sI(colRight,{opacity:'0',transform:'translateX(18px)'});
    ecards.forEach(e => sI(e,{opacity:'0',transform:'translateX(-12px)'}));
    invRows.forEach(e => sI(e,{opacity:'0',transform:'translateY(8px)'}));
    sI(expanded,{opacity:'0'});
    const toH = expanded.scrollHeight; stage.style.transition='height 0.44s cubic-bezier(0.4,0,0.2,1)'; stage.style.height=toH+'px';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      expanded.style.transition='opacity 0.18s ease'; expanded.style.opacity='1';
      setTimeout(() => { divL.style.transition='all 0.46s cubic-bezier(0.34,1.1,0.64,1)'; divL.style.transform='scaleY(1)'; divL.style.opacity='1'; }, 80);
      setTimeout(() => { divR.style.transition='all 0.46s cubic-bezier(0.34,1.1,0.64,1)'; divR.style.transform='scaleY(1)'; divR.style.opacity='1'; }, 130);
      colLeft.style.transition='opacity 0.38s ease 0.08s,transform 0.4s cubic-bezier(0.34,1.1,0.64,1) 0.08s'; colLeft.style.opacity='1'; colLeft.style.transform='translateX(0)';
      colRight.style.transition='opacity 0.38s ease 0.12s,transform 0.4s cubic-bezier(0.34,1.1,0.64,1) 0.12s'; colRight.style.opacity='1'; colRight.style.transform='translateX(0)';
      ecards.forEach((e,i) => setTimeout(() => { e.style.transition='opacity 0.3s ease,transform 0.32s cubic-bezier(0.34,1.1,0.64,1)'; e.style.opacity='1'; e.style.transform='translateX(0)'; }, 100+i*48));
      invRows.forEach((e,i) => setTimeout(() => { e.style.transition='opacity 0.3s ease,transform 0.32s cubic-bezier(0.34,1.1,0.64,1)'; e.style.opacity='1'; e.style.transform='translateY(0)'; }, 140+i*42));
      setTimeout(() => { stage.style.height='auto'; stage.style.transition=''; }, 460);
    }));
  }, shelfDone+160);
}

function collapse() {
  if (!isExpanded) return; isExpanded = false;
  const ecards = [...document.querySelectorAll('.ecard')];
  const invRows = [...document.querySelectorAll('.inv-row')];
  ecards.forEach((e,i) => setTimeout(() => { e.style.transition='opacity 0.18s ease,transform 0.18s ease'; e.style.opacity='0'; e.style.transform='translateX(-10px)'; }, i*28));
  invRows.forEach((e,i) => setTimeout(() => { e.style.transition='opacity 0.18s ease,transform 0.18s ease'; e.style.opacity='0'; e.style.transform='translateY(5px)'; }, i*24));
  setTimeout(() => {
    divL.style.transition='all 0.26s ease'; divL.style.transform='scaleY(0)'; divL.style.opacity='0';
    divR.style.transition='all 0.26s ease'; divR.style.transform='scaleY(0)'; divR.style.opacity='0';
    colLeft.style.transition='opacity 0.2s ease,transform 0.2s ease'; colLeft.style.opacity='0'; colLeft.style.transform='translateX(-12px)';
    colRight.style.transition='opacity 0.2s ease,transform 0.2s ease'; colRight.style.opacity='0'; colRight.style.transform='translateX(12px)';
  }, 60);
  setTimeout(() => { expanded.style.transition='opacity 0.16s ease'; expanded.style.opacity='0'; }, 240);
  const startH = stage.scrollHeight; stage.style.height=startH+'px';
  setTimeout(() => {
    expanded.style.display='none'; expanded.style.opacity='1';
    ecards.forEach(e => { e.style.transition='none'; e.style.opacity='1'; e.style.transform=''; });
    invRows.forEach(e => { e.style.transition='none'; e.style.opacity='1'; e.style.transform=''; });
    sI(divL,{transform:'scaleY(1)',opacity:'1'}); sI(divR,{transform:'scaleY(1)',opacity:'1'});
    sI(colLeft,{opacity:'1',transform:''}); sI(colRight,{opacity:'1',transform:''});
    sI(bkL,{transformOrigin:'center center',transform:'scaleY(7) scaleX(0.13)',opacity:'0.08'});
    sI(bkR,{transformOrigin:'center center',transform:'scaleY(7) scaleX(0.13)',opacity:'0.08'});
    shelves.forEach(sl => sI(sl,{transform:'scaleX(0)',opacity:'0',height:'0px'}));
    const bInfos = visibleBInfos();
    bInfos.forEach(el => { el.style.transition='none'; el.style.opacity='0'; });
    openHint.style.transition='none'; openHint.style.opacity='0';
    collapsed.style.display='flex';
    const toH = collapsed.scrollHeight; stage.style.transition='height 0.4s cubic-bezier(0.4,0,0.2,1)'; stage.style.height=toH+'px';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bkL.style.transition='all 0.48s cubic-bezier(0.34,1.3,0.64,1)'; bkL.style.transform=''; bkL.style.opacity='1';
      bkR.style.transition='all 0.48s cubic-bezier(0.34,1.3,0.64,1)'; bkR.style.transform=''; bkR.style.opacity='1';
      shelves.forEach((sl,i) => setTimeout(() => { sl.style.transition='all 0.28s cubic-bezier(0.34,1.2,0.64,1)'; sl.style.transform=''; sl.style.opacity='1'; sl.style.height='2.5px'; }, 140+i*25));
      setTimeout(() => {
        bInfos.forEach(el => { el.style.transition='opacity 0.26s ease'; el.style.opacity='1'; });
        openHint.style.transition='opacity 0.26s ease'; openHint.style.opacity='1';
      }, 340);
      setTimeout(() => { stage.style.height='auto'; stage.style.transition=''; }, 470);
    }));
  }, 360);
}

function toggleSettings(e) {
  e.stopPropagation();
  const btn = document.getElementById('settingsBtn');
  const open = settings.style.display==='flex';
  settings.style.display = open ? 'none' : 'flex';
  btn.classList.toggle('active', !open);
  if (!open) { collapsed.style.display='none'; expanded.style.display='none'; }
  else { if (!isExpanded) collapsed.style.display='flex'; else expanded.style.display='block'; }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function formatDate(d) {
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && now.getDate()===d.getDate()) return 'Today ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Photo upload input
  const inp = document.createElement('input');
  inp.type='file'; inp.id='photoInput'; inp.accept='image/*,.pdf'; inp.multiple=true; inp.style.display='none';
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
});