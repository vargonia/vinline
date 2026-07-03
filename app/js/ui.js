// vinline — stage animations, modals, settings panel, shared DOM refs
import { resetEmailModal } from './inbox.js';
import { resetDriveModal } from './drive.js';
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

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────

function showToast(msg, opts = {}) {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  if (opts.actionLabel && opts.onAction) {
    const b = document.createElement('button');
    b.textContent = opts.actionLabel;
    b.onclick = () => { opts.onAction(); t.remove(); };
    t.appendChild(b);
  }
  host.appendChild(t);
  setTimeout(() => t.remove(), opts.duration || 6000);
  return t;
}

export {
  stage, collapsed, expanded, settings, bkL, bkR, openHint, colLeft, colRight, divL, divR, shelves, inboxBody,
  isExpanded, openModal, closeModal, syncBtn, sI, visibleBInfos, expand, collapse, toggleSettings, showToast
};
