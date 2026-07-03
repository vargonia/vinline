// vinline — preview/style editor, document renderer, print-to-PDF
import { CAT_ORDER, EXPORT_STYLE_KEY, FONT_PAIRINGS, COLOR_SWATCHES, SPACING_PRESETS, COLUMN_OPTIONS, SPACING_OPTIONS, PAPER_SIZE_OPTIONS } from './config.js';
import { esc, imageToBase64 } from './utils.js';
import { activateDialog, deactivateDialog, setSwitch } from './ui.js';
import { gatherWineListData } from './core.js';
let currentExportStyle = null;
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
  activateDialog(document.getElementById('previewOverlay'), closePreviewEditor);
}

function closePreviewEditor() {
  deactivateDialog();
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
  setSwitch(document.getElementById('togRegion'), styleConfig.showRegion);
  setSwitch(document.getElementById('togDecimal'), styleConfig.decimalPrices);
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
  setSwitch(document.getElementById('togRegion'), currentExportStyle.showRegion);
  refreshPreviewPane();
}
function toggleDecimalPrices() {
  currentExportStyle.decimalPrices = !currentExportStyle.decimalPrices;
  saveExportStyle(currentExportStyle);
  setSwitch(document.getElementById('togDecimal'), currentExportStyle.decimalPrices);
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
      <button class="sec-move sec-move-up" onclick="moveSection('${esc(s.category)}', -1)" aria-label="move ${esc(s.category)} up">▲</button><button class="sec-move sec-move-dn" onclick="moveSection('${esc(s.category)}', 1)" aria-label="move ${esc(s.category)} down">▼</button>
      <button class="tog ${s.visible ? '' : 'off'}" role="switch" aria-checked="${s.visible}" onclick="toggleSectionVisible('${esc(s.category)}')" aria-label="toggle ${esc(s.category)} visibility"></button>
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

function moveSection(cat, delta) {
  const sections = resolveSectionConfig(currentExportStyle, gatherWineListData());
  const order = sections.map(s => s.category);
  const i = order.indexOf(cat);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  currentExportStyle.sectionOrder = order;
  saveExportStyle(currentExportStyle);
  renderSectionDragList(currentExportStyle);
  refreshPreviewPane();
  document.querySelector(`.section-drag-item[data-cat="${CSS.escape(cat)}"] .sec-move${delta < 0 ? '-up' : '-dn'}`)?.focus();
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
export {
  defaultExportStyle, loadExportStyle, saveExportStyle, resolveSectionConfig,
  formatPrice, buildSubLine, renderWineListDoc, applyDocStyleVars,
  openPreviewEditor, closePreviewEditor, refreshPreviewPane, populatePreviewPanel,
  renderPillRow, renderColorSwatches, renderFontPairings,
  setExportTitle, setExportSubtitle, setFontPairing, setColorSwatch, setColumns, setSpacing, setPaperSize,
  toggleShowRegion, toggleDecimalPrices,
  renderSectionDragList, onSectionDragStart, onSectionDragOver, onSectionDrop, onSectionDragEnd,
  reorderSection, toggleSectionVisible, moveSection,
  renderLogoDropzone, handleLogoUpload, removeLogo,
  printWineListDoc, exportPdfFromEditor, quickExportPdf
};
