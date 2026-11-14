const $ = s => document.querySelector(s), B = document.body;
let S = null, edit = false, infoOn = false, tabsSt = { pinned: false, back: false, fwd: false };
if (api.platform === 'darwin') B.classList.add('mac');
const P = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICONS = {
  back: 'M15 5l-7 7 7 7', fwd: 'M9 5l7 7-7 7', reload: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z', menu: 'M5 7h14M5 12h14M5 17h14'
};
const TIPS = { back: 'Назад', fwd: 'Вперёд', reload: 'Обновить', home: 'Главная', menu: 'Меню', prof: 'Профиль' };
const DEFORDER = ['back', 'fwd', 'reload', 'home', 'addr', 'prof', 'menu'];
const els = {};
for (const k of Object.keys(ICONS)) { const b = document.createElement('button'); b.className = 'b'; b.dataset.id = k; b.title = TIPS[k]; b.innerHTML = P(ICONS[k]); els[k] = b; }
// адресная строка со значками внутри: установить, закрепить, настройки сайта
const addr = document.createElement('input');
addr.id = 'addr'; addr.placeholder = 'Поиск или адрес'; addr.spellcheck = false;
const mk = (cls, title, d) => { const b = document.createElement('button'); b.className = 'ab ' + cls; b.title = title; b.innerHTML = P(d); return b; };
const instBtn = mk('inst', 'Установить сайт как приложение', 'M4 5h16v11H4zM8 20h8M12 16v4M9.5 9.5L12 12l2.5-2.5M12 6.5V12');
const pinBtn = mk('pin', 'Закрепить на главной', 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z');
const siteBtn = mk('site', 'Настройки сайта', 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6');
const aw = document.createElement('div'); aw.id = 'addrw'; aw.dataset.id = 'addr';
const abs = document.createElement('div'); abs.className = 'abs'; abs.append(instBtn, pinBtn, siteBtn); aw.append(addr, abs);
els.addr = aw; instBtn.style.display = 'none';
const prof = els.prof = document.createElement('button'); prof.className = 'b prof'; prof.dataset.id = 'prof'; prof.title = TIPS.prof;
const ec = document.createElement('div'); ec.id = 'ec';
ec.innerHTML = `<span>Вкладки</span><select id="et"><option value="top">сверху</option><option value="left">слева</option></select>
 <span>Панель</span><select id="eb"><option value="top">сверху</option><option value="bottom">снизу</option></select><button id="ed">Готово</button>`;

const pos = e => { const r = e.currentTarget.getBoundingClientRect(); return [r.left, r.bottom + 4]; };
const act = {
  back: () => api.send('nav:back'), fwd: () => api.send('nav:fwd'), reload: () => api.send('nav:reload'), home: () => api.send('nav:home'),
  menu: e => api.send('menu', ...pos(e)), prof: e => api.send('pmenu', ...pos(e))
};
for (const k in act) els[k].addEventListener('click', e => { if (edit) { toggleHide(k); return; } act[k](e); });
pinBtn.onclick = () => !edit && api.send('pin');
instBtn.onclick = () => !edit && api.send('install');
siteBtn.onclick = e => { if (!edit) api.send('site', ...pos(e)); };
addr.onkeydown = e => { if (e.key === 'Enter') { api.send('nav:go', addr.value); addr.blur(); } };
addr.onfocus = () => addr.select();

function bar() {
  const L = S.layout, box = $('#bar'), hidden = new Set(L.hidden);
  const order = [...L.order.filter(k => els[k]), ...DEFORDER.filter(k => !L.order.includes(k))];
  const vis = order.filter(k => !hidden.has(k) || k === 'addr');
  const ghosts = order.filter(k => hidden.has(k) && k !== 'addr');
  [...vis, ...(edit ? ghosts : [])].forEach(k => {
    const el = els[k]; el.classList.toggle('ghost', hidden.has(k)); el.draggable = edit; box.append(el);
  });
  Object.keys(els).forEach(k => { if (!vis.includes(k) && !(edit && ghosts.includes(k))) els[k].remove(); });
  box.append(ec);
  prof.textContent = ((S.profiles.find(p => p.id === S.profile) || {}).name || 'П').trim().charAt(0).toUpperCase();
  ec.querySelector('#et').value = L.tabs; ec.querySelector('#eb').value = L.bar;
}
function lay() {
  const L = S.layout, top = L.bar !== 'bottom';
  B.classList.toggle('tl', L.tabs === 'left'); B.classList.toggle('bb', !top);
  document.documentElement.style.setProperty('--t', (40 + (top ? 56 : 0) + (infoOn ? 38 : 0)) + 'px');
  document.documentElement.style.setProperty('--b', (top ? 0 : 56) + 'px');
  $('#info').style.top = (top ? 96 : 44) + 'px';
}
function toggleHide(k) {
  if (k === 'addr') return;
  const h = new Set(S.layout.hidden); h.has(k) ? h.delete(k) : h.add(k);
  api.send('settings:set', { layout: { hidden: [...h] } });
}
function setEdit(v) { edit = v; B.classList.toggle('edit', v); if (S) bar(); }
ec.querySelector('#ed').onclick = () => setEdit(false);
ec.querySelector('#et').onchange = e => api.send('settings:set', { layout: { tabs: e.target.value } });
ec.querySelector('#eb').onchange = e => api.send('settings:set', { layout: { bar: e.target.value } });
let drag = null;
$('#bar').addEventListener('dragstart', e => { const t = e.target.closest('[data-id]'); if (!edit || !t) return e.preventDefault(); drag = t; e.dataTransfer.effectAllowed = 'move'; });
$('#bar').addEventListener('dragover', e => {
  if (!drag) return; e.preventDefault();
  const t = e.target.closest('[data-id]'); if (!t || t === drag) return;
  const r = t.getBoundingClientRect(); $('#bar').insertBefore(drag, e.clientX - r.left < r.width / 2 ? t : t.nextSibling);
});
$('#bar').addEventListener('dragend', () => {
  drag = null; const ids = [...$('#bar').children].filter(c => c.dataset.id).map(c => c.dataset.id);
  const rest = S.layout.order.filter(k => !ids.includes(k));
  api.send('settings:set', { layout: { order: [...ids, ...rest] } });
});

/* вкладки: обновляем только изменившееся, ничего не пересоздаём */
const tabsBox = $('#tabs'), tabEls = new Map();
const plus = document.createElement('button'); plus.id = 'plus'; plus.className = 'b'; plus.title = 'Новая вкладка (Ctrl+T)'; plus.innerHTML = P('M12 5v14M5 12h14');
plus.onclick = () => api.send('tab:new'); tabsBox.append(plus);
let dg = null, moved = false;
function mkTab(t) {
  const el = document.createElement('div'); el.className = 'tab';
  el.innerHTML = '<img alt=""><span></span><b class="au"></b><div class="x">✕</div>';
  el.onclick = () => { if (moved) { moved = false; return; } api.send('tab:switch', t.id); };
  el.onauxclick = e => { if (e.button === 1) api.send('tab:close', t.id); };
  el.oncontextmenu = e => { e.preventDefault(); api.send('tabmenu', t.id, e.clientX, e.clientY); };
  el.querySelector('.x').onclick = e => { e.stopPropagation(); api.send('tab:close', t.id); };
  el._a = el.querySelector('.au'); el._a.onclick = e => { e.stopPropagation(); api.send('tab:mute', t.id); };
  el._i = el.querySelector('img'); el._s = el.querySelector('span');
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.x,.au')) return;
    dg = { el, id: t.id, x: e.clientX, y: e.clientY, on: false, zone: null };
    try { el.setPointerCapture(e.pointerId); } catch {}
    addEventListener('pointermove', dragMove); addEventListener('pointerup', dragEnd); addEventListener('pointercancel', dragEnd);
  });
  return el;
}
// перетаскивание вкладки: по панели — меняет порядок, вниз на страницу — разделяет экран
function dragMove(e) {
  if (!dg) return; const v = B.classList.contains('tl');
  if (!dg.on) { if (Math.hypot(e.clientX - dg.x, e.clientY - dg.y) < 6) return; dg.on = true; moved = true; dg.el.classList.add('drag'); dg.txt = dg.el._s.textContent; }
  const zone = v ? e.clientX > 280 : e.clientY > 112;
  dg.zone = zone ? (e.clientX < innerWidth / 2 ? 'left' : 'right') : null;
  dg.el._s.textContent = dg.zone ? (dg.zone === 'left' ? '◧ слева' : 'справа ◨') : dg.txt;
  if (zone) return;
  const p = v ? e.clientY : e.clientX; let ref = null;
  for (const s of tabsBox.querySelectorAll('.tab')) {
    if (s === dg.el) continue; const r = s.getBoundingClientRect();
    if (p < (v ? r.top + r.height / 2 : r.left + r.width / 2)) { ref = s; break; }
  }
  if (ref !== dg.el.nextElementSibling && !(ref === null && dg.el.nextElementSibling === plus)) tabsBox.insertBefore(dg.el, ref || plus);
}
function dragEnd() {
  removeEventListener('pointermove', dragMove); removeEventListener('pointerup', dragEnd); removeEventListener('pointercancel', dragEnd);
  const d = dg; dg = null; if (!d) return;
  d.el.classList.remove('drag'); if (!d.on) return;
  d.el._s.textContent = d.txt;
  if (d.zone) api.send('tab:split', d.id, d.zone);
  else api.send('tab:move', d.id, [...tabsBox.querySelectorAll('.tab')].indexOf(d.el));
  setTimeout(() => { moved = false; }, 50);
}
function tabsRender(d) {
  tabsSt = d; const seen = new Set();
  d.tabs.forEach((t, i) => {
    let el = tabEls.get(t.id); if (!el) { el = mkTab(t); tabEls.set(t.id, el); }
    if (el._t !== t.title) { el._t = t.title; el._s.textContent = t.title; el.title = t.title; }
    const ic = t.icon || 'logo.png'; if (el._ic !== ic) { el._ic = ic; el._i.src = ic; el._i.onerror = () => { el._i.src = 'logo.png'; }; }
    el.classList.toggle('on', t.id === d.active); el.classList.toggle('zz', t.sleep); el.classList.toggle('ld', t.loading);
    el._a.textContent = t.aud ? (t.muted ? '🔇' : '🔊') : (t.muted ? '🔇' : ''); el.classList.toggle('sp', !!t.sp);
    if (!(dg && dg.on) && tabsBox.children[i] !== el) tabsBox.insertBefore(el, tabsBox.children[i] || plus);
    if (t.id === d.active && document.activeElement !== addr && addr._v !== t.url) { addr._v = t.url; addr.value = t.url; }
    seen.add(t.id);
  });
  for (const [id, el] of tabEls) if (!seen.has(id)) { el.remove(); tabEls.delete(id); }
  els.back.disabled = !d.back; els.fwd.disabled = !d.fwd; pinBtn.classList.toggle('on', d.pinned); pinBtn.style.display = siteBtn.style.display = d.web ? '' : 'none'; instBtn.style.display = d.installable ? '' : 'none';
}

/* инфо-полоса */
const info = $('#info');
function infoRender(d) {
  infoOn = !!d; info.classList.toggle('show', !!d); info.textContent = '';
  if (d && d.find) {
    const fi = document.createElement('input'); fi.id = 'fi'; fi.placeholder = 'Найти на странице'; const fc = document.createElement('span'); fc.id = 'fc';
    const mkb = (t, f) => { const b = document.createElement('button'); b.className = 'ib'; b.textContent = t; b.onclick = f; return b; };
    fi.oninput = () => api.send('find:go', fi.value, true, false);
    fi.onkeydown = e => { if (e.key === 'Enter') api.send('find:go', fi.value, !e.shiftKey, true); else if (e.key === 'Escape') api.send('find:close'); };
    info.append(fi, fc, mkb('▲', () => api.send('find:go', fi.value, false, true)), mkb('▼', () => api.send('find:go', fi.value, true, true)), mkb('✕', () => api.send('find:close')));
    setTimeout(() => fi.focus(), 40);
  } else if (d) {
    const p = document.createElement('p'); p.textContent = d.text; info.append(p);
    d.btns.forEach(([l, a, arg]) => { const b = document.createElement('button'); b.className = 'ib'; b.textContent = l; b.onclick = () => api.send('info:act', a, arg); info.append(b); });
    const x = document.createElement('button'); x.className = 'ib'; x.textContent = '✕'; x.onclick = () => api.send('info:close'); info.append(x);
  }
  if (S) lay();
}

/* экран блокировки */
const lk = $('#lock');
function tick() { const d = new Date(); $('#clock').textContent = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); $('#date').textContent = d.toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' }); }
function lock() { $('#ltext').textContent = S.lockText || 'Добро пожаловать'; tick(); lk.classList.remove('out'); lk.classList.add('show'); api.send('lock', true); }
function unlock() { lk.classList.add('out'); setTimeout(() => { lk.classList.remove('show', 'out'); api.send('lock', false); }, 380); }
lk.onclick = unlock; setInterval(() => lk.classList.contains('show') && tick(), 10000);
addEventListener('keydown', e => { if (lk.classList.contains('show') && (e.key === 'Enter' || e.key === ' ')) unlock(); });

api.on('settings', s => { S = s; applyTheme(s); lay(); bar(); });
api.on('tabs', tabsRender);
api.on('info', infoRender);
api.on('found', r => { const f = $('#fc'); if (f) f.textContent = r.n ? r.i + ' / ' + r.n : 'нет совпадений'; });
api.on('cmd', c => { if (c === 'addr') { addr.focus(); } else if (c === 'edit') setEdit(true); else if (c === 'lock') lock(); });
api.send('ready');

// значок сайта -> красивая плитка 256x256 для ярлыка
window.tile = src => new Promise(res => {
  const i = new Image();
  i.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.beginPath(); x.roundRect(6, 6, 244, 244, 58); x.clip();
    if (i.naturalWidth >= 120) { x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); x.drawImage(i, 0, 0, 256, 256); }
    else { x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); const sc = Math.min(150 / i.naturalWidth, 150 / i.naturalHeight), w = i.naturalWidth * sc, h = i.naturalHeight * sc; x.drawImage(i, 128 - w / 2, 128 - h / 2, w, h); }
    res(c.toDataURL('image/png'));
  };
  i.onerror = () => res(null); i.src = src;
});
