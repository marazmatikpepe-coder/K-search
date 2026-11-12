const $ = s => document.querySelector(s), B = document.body;
let S = null, edit = false, infoOn = false, tabsSt = { pinned: false, back: false, fwd: false };
if (api.platform === 'darwin') B.classList.add('mac');
const P = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICONS = {
  back: 'M15 5l-7 7 7 7', fwd: 'M9 5l7 7-7 7', reload: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z', pin: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z', menu: 'M5 7h14M5 12h14M5 17h14'
};
const TIPS = { back: 'Назад', fwd: 'Вперёд', reload: 'Обновить', home: 'Главная', pin: 'Закрепить на главной', lock: 'Заблокировать', menu: 'Меню', prof: 'Профиль', addr: 'Адрес' };
const els = {};
for (const k of Object.keys(ICONS)) { const b = document.createElement('button'); b.className = 'b'; b.dataset.id = k; b.title = TIPS[k]; b.innerHTML = P(ICONS[k]); els[k] = b; }
const addr = els.addr = document.createElement('input');
addr.id = 'addr'; addr.dataset.id = 'addr'; addr.placeholder = 'Поиск или адрес'; addr.spellcheck = false;
const prof = els.prof = document.createElement('button'); prof.className = 'b prof'; prof.dataset.id = 'prof'; prof.title = TIPS.prof;
const ec = document.createElement('div'); ec.id = 'ec';
ec.innerHTML = `<span>Вкладки</span><select id="et"><option value="top">сверху</option><option value="left">слева</option></select>
 <span>Панель</span><select id="eb"><option value="top">сверху</option><option value="bottom">снизу</option></select><button id="ed">Готово</button>`;

const act = {
  back: () => api.send('nav:back'), fwd: () => api.send('nav:fwd'), reload: () => api.send('nav:reload'), home: () => api.send('nav:home'),
  pin: () => api.send('pin'), lock: () => lock(), menu: e => { const r = e.currentTarget.getBoundingClientRect(); api.send('menu', r.left, r.bottom + 4); },
  prof: e => { const r = e.currentTarget.getBoundingClientRect(); api.send('pmenu', r.left, r.bottom + 4); }
};
for (const k in act) els[k].addEventListener('click', e => { if (edit) { toggleHide(k); return; } act[k](e); });
addr.onkeydown = e => { if (e.key === 'Enter') { api.send('nav:go', addr.value); addr.blur(); } };
addr.onfocus = () => addr.select();

function bar() {
  const L = S.layout, box = $('#bar'), hidden = new Set(L.hidden);
  const vis = L.order.filter(k => els[k] && !hidden.has(k) || k === 'addr');
  const ghosts = L.order.filter(k => els[k] && hidden.has(k) && k !== 'addr');
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
function mkTab(t) {
  const el = document.createElement('div'); el.className = 'tab';
  el.innerHTML = '<img alt=""><span></span><div class="x">✕</div>';
  el.onclick = () => api.send('tab:switch', t.id);
  el.onauxclick = e => { if (e.button === 1) api.send('tab:close', t.id); };
  el.querySelector('.x').onclick = e => { e.stopPropagation(); api.send('tab:close', t.id); };
  el._i = el.querySelector('img'); el._s = el.querySelector('span'); return el;
}
function tabsRender(d) {
  tabsSt = d; const seen = new Set();
  d.tabs.forEach((t, i) => {
    let el = tabEls.get(t.id); if (!el) { el = mkTab(t); tabEls.set(t.id, el); }
    if (el._t !== t.title) { el._t = t.title; el._s.textContent = t.title; el.title = t.title; }
    const ic = t.icon || 'logo.png'; if (el._ic !== ic) { el._ic = ic; el._i.src = ic; el._i.onerror = () => { el._i.src = 'logo.png'; }; }
    el.classList.toggle('on', t.id === d.active); el.classList.toggle('zz', t.sleep); el.classList.toggle('ld', t.loading);
    if (tabsBox.children[i] !== el) tabsBox.insertBefore(el, tabsBox.children[i] || plus);
    if (t.id === d.active && document.activeElement !== addr && addr._v !== t.url) { addr._v = t.url; addr.value = t.url; }
    seen.add(t.id);
  });
  for (const [id, el] of tabEls) if (!seen.has(id)) { el.remove(); tabEls.delete(id); }
  els.back.disabled = !d.back; els.fwd.disabled = !d.fwd; els.pin.classList.toggle('on', d.pinned);
}

/* инфо-полоса */
const info = $('#info');
function infoRender(d) {
  infoOn = !!d; info.classList.toggle('show', !!d); info.textContent = '';
  if (d) {
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
api.on('cmd', c => { if (c === 'addr') { addr.focus(); } else if (c === 'edit') setEdit(true); else if (c === 'lock') lock(); });
api.send('ready');
