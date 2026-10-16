// Hinweis: Eigene Verknüpfungen legst du direkt auf der Seite an (Mauszeiger über eine Kachel, drei Punkte).
'use strict';
const $ = id => document.getElementById(id);
const t = k => chrome.i18n.getMessage(k);
const UI_LANG = chrome.i18n.getUILanguage();
const MAX_SHORTCUTS = 10;
const DOTS_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

// ---------- Sprache des Browsers ----------
document.documentElement.lang = UI_LANG;
document.documentElement.dir = t('@@bidi_dir');
document.title = t('newTabTitle');
document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
document.querySelectorAll('[data-i18n-aria]').forEach(el => {
  el.setAttribute('aria-label', t(el.dataset.i18nAria)); el.title = t(el.dataset.i18nAria);
});
$('q').placeholder = t('searchPlaceholder');
$('q').setAttribute('aria-label', t('searchPlaceholder'));
$('imgLink').textContent = t('imagesLink');

// ---------- Zustand (wird im Browser gespeichert) ----------
const state = { timeFormat: 'auto', mode: 'custom', shortcuts: [], top: [] };
const save = () => chrome.storage.local.set({ timeFormat: state.timeFormat, mode: state.mode, shortcuts: state.shortcuts });
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

// Seitentitel enthalten oft Zähler wie "(307) YouTube"; die Zahl gehört nicht zum Namen.
const cleanTitle = s => (s || '').replace(/^\(\d+\+?\)\s*/, '').trim();
async function topSites() {
  try { return (await chrome.topSites.get()).map(s => ({ title: cleanTitle(s.title) || hostOf(s.url), url: s.url })); }
  catch { return []; }
}
// Optional: eine mitgelieferte shortcuts.json (aus dem Import-Skript) übernimmt deine angehefteten Chrome-Verknüpfungen 1:1.
async function bundled() {
  try {
    const r = await fetch(chrome.runtime.getURL('shortcuts.json'));
    if (!r.ok) return null;
    const src = await r.text(), j = JSON.parse(src);
    if (!Array.isArray(j)) return null;
    return { src, list: j.filter(x => x && x.url).slice(0, MAX_SHORTCUTS).map(x => ({ title: String(x.title || hostOf(x.url)), url: String(x.url) })) };
  } catch { return null; }
}

// ---------- Uhr ----------
// Der Browser kann das 12/24-Stunden-Format des Betriebssystems nicht auslesen; deshalb gibt es die Einstellung.
function timeOptions(fmt, lang) {
  const hc = new Intl.DateTimeFormat(lang, { hour: 'numeric' }).resolvedOptions().hourCycle;
  const cycle = fmt === '24' ? 'h23' : fmt === '12' ? 'h12' : hc;
  const is24 = cycle === 'h23' || cycle === 'h24';
  return { hour: is24 ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: cycle };
}
function tick() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString(UI_LANG, timeOptions(state.timeFormat, UI_LANG));
  $('date').textContent = now.toLocaleDateString(UI_LANG, { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Suche ----------
$('searchform').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) location.href = q;
  else if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(q)) location.href = 'https://' + q;
  else chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
});

// ---------- Verknüpfungen ----------
function normalizeUrl(raw) {
  let v = raw.trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch { return null; }
}
function faviconUrl(pageUrl) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', '32');
  return u.toString();
}
function makeTile(s, idx) {
  const wrap = document.createElement('div'); wrap.className = 'tile';
  wrap.draggable = true; wrap.dataset.idx = idx;
  const a = document.createElement('a'); a.className = 'link'; a.href = s.url; a.draggable = false;
  const ico = document.createElement('span'); ico.className = 'ico';
  const img = document.createElement('img'); img.src = faviconUrl(s.url); img.alt = ''; img.draggable = false;
  img.addEventListener('error', () => {
    const b = document.createElement('b'); b.textContent = (s.title || '?')[0].toUpperCase(); img.replaceWith(b);
  });
  ico.append(img);
  const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = s.title;
  a.append(ico, lbl); wrap.append(a);
  if (idx >= 0) {
    const d = document.createElement('button');
    d.type = 'button'; d.className = 'dots'; d.innerHTML = DOTS_SVG;
    d.setAttribute('aria-label', t('editShortcut'));
    d.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); $('settings').hidden = true; $('apps').hidden = true; openMenu(d, idx); });
    wrap.append(d);
  }
  return wrap;
}
function makeAddTile() {
  const wrap = document.createElement('div'); wrap.className = 'tile add';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'link';
  const ico = document.createElement('span'); ico.className = 'ico'; ico.innerHTML = PLUS_SVG;
  const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = t('addShortcut');
  b.append(ico, lbl); b.addEventListener('click', () => openDialog(-1));
  wrap.append(b); return wrap;
}
const curList = () => (state.mode === 'custom' ? state.shortcuts : state.top.slice(0, MAX_SHORTCUTS));
function ensureCustom() {
  if (state.mode === 'top') {
    state.shortcuts = curList().map(s => ({ ...s })); state.mode = 'custom'; syncSettings();
  }
}
function render() {
  const box = $('tiles'); box.textContent = '';
  const list = curList();
  list.forEach((s, i) => box.append(makeTile(s, i)));
  if (list.length < MAX_SHORTCUTS) box.append(makeAddTile());
}

// Menü (Bearbeiten / Entfernen)
let menuIdx = -1;
function openMenu(btn, idx) {
  menuIdx = idx;
  const m = $('menu'), r = btn.getBoundingClientRect();
  m.hidden = false;
  const w = m.offsetWidth, rtl = document.documentElement.dir === 'rtl';
  m.style.top = (r.bottom + 4) + 'px';
  m.style.left = Math.min(Math.max(8, rtl ? r.right - w : r.left), innerWidth - w - 8) + 'px';
}
$('menuEdit').addEventListener('click', () => { $('menu').hidden = true; openDialog(menuIdx); });
$('menuRemove').addEventListener('click', async () => {
  $('menu').hidden = true; ensureCustom(); state.shortcuts.splice(menuIdx, 1); await save(); render();
});

// Dialog (Hinzufügen / Bearbeiten)
let editIdx = -1;
function openDialog(idx) {
  editIdx = idx;
  const s = idx >= 0 ? curList()[idx] : { title: '', url: '' };
  $('dlgTitle').textContent = t(idx >= 0 ? 'editShortcut' : 'addShortcut');
  $('fName').value = s.title; $('fUrl').value = s.url; $('fUrl').setCustomValidity('');
  $('dlg').showModal(); $('fName').focus();
}
$('fUrl').addEventListener('input', () => $('fUrl').setCustomValidity(''));
$('dlgCancel').addEventListener('click', () => $('dlg').close());
$('dlgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const url = normalizeUrl($('fUrl').value);
  if (!url) { $('fUrl').setCustomValidity(t('invalidUrl')); $('fUrl').reportValidity(); return; }
  const item = { title: $('fName').value.trim() || hostOf(url), url };
  ensureCustom();
  if (editIdx >= 0) state.shortcuts[editIdx] = item; else state.shortcuts.push(item);
  await save(); render(); $('dlg').close();
});

// Reihenfolge per Ziehen ändern (Maustaste halten, nach links oder rechts ziehen)
let dragEl = null, dragList = null;
const tilesBox = $('tiles');
function flip(change) {                       // weiches Verschieben der übrigen Kacheln
  const els = [...tilesBox.children], first = new Map(els.map(el => [el, el.getBoundingClientRect().left]));
  change();
  els.forEach(el => {
    const dx = first.get(el) - el.getBoundingClientRect().left;
    if (dx && el !== dragEl) el.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
  });
}
tilesBox.addEventListener('dragstart', e => {
  const tile = e.target.closest ? e.target.closest('.tile:not(.add)') : null;
  if (!tile) return;
  dragEl = tile; dragList = curList().slice();
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
  requestAnimationFrame(() => tile.classList.add('dragging'));
  $('menu').hidden = true;
});
tilesBox.addEventListener('dragover', e => {
  if (!dragEl) return;
  e.preventDefault();
  const target = e.target.closest('.tile:not(.add)');
  if (!target || target === dragEl) return;
  const r = target.getBoundingClientRect(), mid = r.left + r.width / 2, rtl = document.documentElement.dir === 'rtl';
  const before = rtl ? e.clientX > mid : e.clientX < mid;
  flip(() => (before ? target.before(dragEl) : target.after(dragEl)));
});
document.addEventListener('dragover', e => { if (dragEl) e.preventDefault(); });
document.addEventListener('drop', e => { if (dragEl) e.preventDefault(); });
tilesBox.addEventListener('dragend', async () => {
  if (!dragEl) return;
  const order = [...tilesBox.querySelectorAll('.tile:not(.add)')].map(el => +el.dataset.idx);
  const list = dragList;
  dragEl.classList.remove('dragging'); dragEl = null; dragList = null;
  if (order.every((v, i) => v === i)) return;      // nichts verschoben
  ensureCustom();                                  // wie bei Chrome: Umsortieren macht aus der Auto-Liste eine eigene Liste
  state.shortcuts = order.map(i => list[i]);
  await save(); render();
});

// ---------- Einstellungen ----------
function syncSettings() {
  [['segTime', 'timeFormat'], ['segMode', 'mode']].forEach(([id, key]) =>
    document.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset.val === state[key])));
}
document.querySelectorAll('#segTime button, #segMode button').forEach(b => b.addEventListener('click', async () => {
  state[b.parentElement.id === 'segTime' ? 'timeFormat' : 'mode'] = b.dataset.val;
  await save(); syncSettings(); tick(); render();
}));
$('settingsBtn').addEventListener('click', () => { $('menu').hidden = true; $('apps').hidden = true; $('settings').hidden = !$('settings').hidden; });
document.addEventListener('click', e => {
  if (!e.target.closest('#menu')) $('menu').hidden = true;
  if (!e.target.closest('#settings, #settingsBtn')) $('settings').hidden = true;
  if (!e.target.closest('#apps, #appsBtn')) $('apps').hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('menu').hidden = true; $('settings').hidden = true; $('apps').hidden = true; } });

// ---------- Google-Apps-Raster und Konto-Bild ----------
const svgIcon = (inner, fill) => '<svg viewBox="0 0 24 24" width="26" height="26" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const GOOGLE_APPS = [
  ['Search',    'https://www.google.com/',                  '#8ab4f8', svgIcon('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>')],
  ['Gmail',     'https://mail.google.com/',                 '#f28b82', svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>')],
  ['Drive',     'https://drive.google.com/',                '#fdd663', svgIcon('<path d="M12 3l9 15H3z"/><path d="M7.5 11h9"/>')],
  ['Docs',      'https://docs.google.com/document/',        '#8ab4f8', svgIcon('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>')],
  ['Sheets',    'https://docs.google.com/spreadsheets/',    '#81c995', svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>')],
  ['Slides',    'https://docs.google.com/presentation/',    '#fdd663', svgIcon('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>')],
  ['Calendar',  'https://calendar.google.com/',             '#8ab4f8', svgIcon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>')],
  ['Maps',      'https://maps.google.com/',                 '#81c995', svgIcon('<path d="M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>')],
  ['YouTube',   'https://www.youtube.com/',                 '#f28b82', svgIcon('<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>')],
  ['Photos',    'https://photos.google.com/',               '#f6ae76', svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 17l5-5 4 4 3-3 6 6"/>')],
  ['Translate', 'https://translate.google.com/',            '#8ab4f8', svgIcon('<path d="M4 5h8M8 3v2M5.5 5c.7 3.2 2.7 5.5 5.5 7M11 5c-.8 3.6-3.4 6.2-6.5 7.6M13.5 20l3.5-8 3.5 8M14.8 17.5h4.4"/>')],
  ['News',      'https://news.google.com/',                 '#8ab4f8', svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>')],
  ['Meet',      'https://meet.google.com/',                 '#81c995', svgIcon('<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3"/>')],
  ['Gemini',    'https://gemini.google.com/',               '#c58af9', svgIcon('<path d="M12 3c.6 4.8 3.2 7.4 9 9-5.8 1.6-8.4 4.2-9 9-.6-4.8-3.2-7.4-9-9 5.8-1.6 8.4-4.2 9-9z"/>', true)],
  ['Keep',      'https://keep.google.com/',                 '#fdd663', svgIcon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>')],
  ['Contacts',  'https://contacts.google.com/',             '#8ab4f8', svgIcon('<circle cx="12" cy="9" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>')]
];
function buildApps() {
  const box = $('apps');
  if (box.childElementCount) return;
  GOOGLE_APPS.forEach(([name, url, color, icon]) => {
    const a = document.createElement('a'); a.className = 'app'; a.href = url;
    const ico = document.createElement('span'); ico.className = 'ico'; ico.style.color = color; ico.innerHTML = icon;
    const lbl = document.createElement('span'); lbl.textContent = name;
    a.append(ico, lbl); box.append(a);
  });
}
$('appsBtn').addEventListener('click', () => {
  buildApps(); $('menu').hidden = true; $('settings').hidden = true; $('apps').hidden = !$('apps').hidden;
});
// ---------- Start ----------
(async function init() {
  const s = await chrome.storage.local.get(['timeFormat', 'mode', 'shortcuts', 'bundleSrc']);
  if (s.timeFormat) state.timeFormat = s.timeFormat;
  if (s.mode) state.mode = s.mode;
  chrome.storage.local.remove('avatarUrl');   // Rest der früheren Version aufräumen
  if (Array.isArray(s.shortcuts)) state.shortcuts = s.shortcuts;
  state.top = await topSites();
  const b = await bundled();
  if (b && b.src !== s.bundleSrc) {            // neue/geänderte shortcuts.json -> einmal übernehmen
    state.shortcuts = b.list; state.mode = 'custom';
    await chrome.storage.local.set({ bundleSrc: b.src }); await save();
  }
  syncSettings(); tick(); render();
  setInterval(tick, 10000);
})();
