const { app, BrowserWindow, WebContentsView, ipcMain, Menu, shell, safeStorage, dialog, net, nativeImage, session, nativeTheme } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const importer = require('./importer');
const UD = app.getPath('userData');

/* ---------- настройки ---------- */
const DEF = {
  theme: { preset: 'emerald', mode: 'dark', c: ['#10a371', '#14a39a', '#0b3b47'], angle: 150, glass: .14, blur: 22 },
  saved: [], ram: 0, sleepMin: 30, ramVer: 2, lite: false, engine: 'google', downloadDir: '', askDownload: false, font: '', radius: 16,
  layout: { tabs: 'top', bar: 'top', order: ['back', 'fwd', 'reload', 'home', 'addr', 'prof', 'menu'], hidden: [] },
  profiles: [{ id: 'default', name: 'Основной' }], profile: 'default', pins: {}, perms: {}, onboarded: false, lockText: ''
};
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(UD, f), 'utf8')); } catch { return d; } };
const wr = (f, o) => { try { fs.mkdirSync(UD, { recursive: true }); fs.writeFileSync(path.join(UD, f), JSON.stringify(o)); } catch {} };
const merge = (d, s) => ({ ...d, ...s, theme: { ...d.theme, ...(s.theme || {}) }, layout: { ...d.layout, ...(s.layout || {}) } });
let S = merge(DEF, rd('settings.json', {}));
const saveS = () => wr('settings.json', S);

/* ---------- производительность (до старта) ---------- */
const os = require('os');
if (!S.ramVer) { S.ram = 0; S.sleepMin = 30; S.ramVer = 2; saveS(); }
const TOTALMB = Math.round(os.totalmem() / 1048576);
// общий бюджет: авто = 40% ОЗУ компьютера, но не больше 3000 МБ
const budget = () => Math.min(3000, S.ram > 0 ? S.ram : Math.max(900, Math.round(TOTALMB * 0.4)));
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=' + Math.min(2048, Math.max(768, Math.round(budget() * 0.6))));
app.commandLine.appendSwitch('disk-cache-size', String(60 * 1024 * 1024));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,Translate');
app.setAppUserModelId('com.ksearch.browser');
if (!app.requestSingleInstanceLock()) app.exit(0);

const APPURL = pathToFileURL(__dirname).href + '/';
const HOME = APPURL + 'search.html';
const ENGINES = {
  google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', ddg: 'https://duckduckgo.com/?q=',
  yandex: 'https://yandex.com/search/?text=', brave: 'https://search.brave.com/search?q='
};
const TOPH = 40, BARH = 56, INFOH = 38, SIDEW = 220;
let win, tabs = [], act = {}, nid = 1, locked = false, infoOn = false, iid = 0, pend = null, started = false, findOn = false;
const split = {}, closed = [];
const sess = rd('session.json', {});

function toUrl(s) {
  s = (s || '').trim();
  if (!s) return HOME;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data):/i.test(s)) return s;
  if (/^[a-z]:[\\/]/i.test(s)) return fileRoute(s);
  if (!/\s/.test(s) && /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
  return ENGINES[S.engine] + encodeURIComponent(s);
}
const NATIVE = new Set('html htm xhtml pdf png jpg jpeg gif webp svg bmp ico avif apng mp4 m4v webm ogv ogg mp3 wav m4a flac opus aac mov txt'.split(' '));
function fileRoute(p) {
  const ext = path.extname(p).slice(1).toLowerCase();
  return NATIVE.has(ext) ? pathToFileURL(p).href : APPURL + 'viewer.html#' + encodeURIComponent(p);
}
const ok = e => e.senderFrame && (e.senderFrame.url || '').startsWith(APPURL);
const ui = (c, ...a) => { try { win.webContents.send(c, ...a); } catch {} };
const mine = () => tabs.filter(t => t.profile === S.profile);
const cur = () => tabs.find(t => t.id === act[S.profile]);
const isDark = () => S.theme.mode === 'dark' || (S.theme.mode === 'auto' && nativeTheme.shouldUseDarkColors);

/* ---------- раскладка ---------- */
function insets() {
  const L = S.layout, top = L.bar !== 'bottom';
  return { t: TOPH + (top ? BARH : 0) + (infoOn ? INFOH : 0), b: top ? 0 : BARH, l: L.tabs === 'left' ? SIDEW : 0 };
}
function partner() {
  const sp = split[S.profile], c = act[S.profile]; if (!sp) return null;
  const o = sp.a === c ? sp.b : sp.b === c ? sp.a : -1;
  return tabs.find(t => t.id === o && t.view) || null;
}
function place() {
  if (!win) return;
  const [W, H] = win.getContentSize(), i = insets(), a = cur(), p = partner(), sp = split[S.profile];
  const w = Math.max(0, W - i.l), h = Math.max(0, H - i.t - i.b), g = 6;
  for (const t of tabs) {
    if (!t.view) continue;
    const show = (t === a || t === p) && !locked;
    t.view.setVisible(show);
    if (!show) continue;
    if (p) { const half = Math.floor((w - g) / 2), left = sp.a === t.id; t.view.setBounds({ x: i.l + (left ? 0 : half + g), y: i.t, width: left ? half : w - half - g, height: h }); }
    else t.view.setBounds({ x: i.l, y: i.t, width: w, height: h });
  }
}

/* ---------- вкладки ---------- */
let pt = null;
function push() {
  if (pt) return;
  pt = setTimeout(() => {
    pt = null;
    const a = cur(), wc = a && a.view && a.view.webContents, nh = wc && wc.navigationHistory;
    ui('tabs', {
      active: a && a.id,
      back: !!(nh && nh.canGoBack()), fwd: !!(nh && nh.canGoForward()),
      pinned: !!(a && (S.pins[S.profile] || []).some(p => p.url === a.url)), installable: !!(a && a.manifest), web: !!(a && /^https?:/.test(a.url)),
      split: !!partner(),
      tabs: mine().map(t => { const w = t.view && t.view.webContents, sp = split[S.profile];
        return { id: t.id, title: t.title || 'Новая вкладка', icon: t.icon, loading: t.loading, sleep: !t.view,
          aud: !!(w && w.isCurrentlyAudible()), muted: !!(w && w.isAudioMuted()), sp: !!(sp && (sp.a === t.id || sp.b === t.id) && partner()),
          url: t.url.startsWith(APPURL) ? '' : t.url }; })
    });
    saveSession();
  }, 50);
}
let st = null;
function saveSession() {
  clearTimeout(st);
  st = setTimeout(() => {
    for (const p of S.profiles) {
      const ts = tabs.filter(t => t.profile === p.id);
      if (ts.length) sess[p.id] = { tabs: ts.map(t => ({ url: t.url, title: t.title, icon: t.icon })), active: Math.max(0, ts.findIndex(t => t.id === act[p.id])) };
    }
    wr('session.json', sess);
  }, 1500);
}
const hooked = new Set();
function mkView(t) {
  const ses = session.fromPartition('persist:p-' + t.profile);
  hookDl(ses); hookPerm(ses, t.profile);
  const v = new WebContentsView({ webPreferences: { session: ses, sandbox: true, preload: path.join(__dirname, 'tab-preload.js'),
    additionalArguments: ['--app-url=' + APPURL], plugins: true, backgroundThrottling: true, spellcheck: false } });
  t.view = v; win.contentView.addChildView(v);
  const wc = v.webContents;
  wc.on('page-title-updated', (_, ti) => { t.title = ti; push(); });
  wc.on('did-navigate', (_, u) => { t.url = u; t.manifest = ''; push(); });
  wc.on('did-navigate-in-page', (_, u, main) => { if (main) { t.url = u; push(); } });
  wc.on('did-start-loading', () => { t.loading = true; push(); });
  wc.on('did-stop-loading', () => { t.loading = false; push(); });
  wc.on('page-favicon-updated', (_, f) => { t.icon = f[0] || ''; push(); });
  wc.on('before-input-event', key);
  wc.on('media-started-playing', () => { t.media = true; try { wc.setBackgroundThrottling(false); } catch {} push(); });
  wc.on('media-paused', () => { t.media = false; try { wc.setBackgroundThrottling(true); } catch {} push(); });
  wc.on('audio-state-changed', push);
  wc.on('found-in-page', (_, r) => ui('found', { n: r.matches, i: r.activeMatchOrdinal }));
  wc.on('focus', () => { const sp = split[t.profile]; if (sp && (sp.a === t.id || sp.b === t.id) && act[t.profile] !== t.id) { act[t.profile] = t.id; t.last = Date.now(); push(); } });
  wc.on('render-process-gone', (_, d) => {
    if (d.reason === 'clean-exit' || d.reason === 'killed') return;
    const now = Date.now(); if (now - (t.crashAt || 0) > 60000) t.crash = 0; t.crashAt = now; t.crash = (t.crash || 0) + 1;
    if (t.crash <= 3) setTimeout(() => { try { wc.reload(); } catch {} }, 400);
    else info({ text: 'Вкладка «' + (t.title || t.url) + '» перестала отвечать. Обновите её вручную', auto: 8000 });
  });
  wc.once('did-finish-load', () => {
    if (!t.restore) return; const r = t.restore; t.restore = null;
    setTimeout(() => { try { wc.executeJavaScript(`(()=>{scrollTo(0,${r.y | 0});const v=document.querySelector('video'),T=${Math.floor(r.v || 0)};if(v&&T>5){const s=()=>{if(v.duration>T)v.currentTime=T};v.readyState>0?s():v.addEventListener('loadedmetadata',s,{once:true})}})()`); } catch {} }, 1200);
  });
  wc.on('did-fail-load', (_, code, desc, u, main) => {
    if (main && code !== -3) wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      `<body style="font:16px system-ui;background:#111a17;color:#eaf4f0;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Не удалось открыть страницу</h2><p style="opacity:.6;margin-top:8px">${desc}</p></div>`));
  });
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' }; });
  wc.loadURL(t.url);
}
function mkTab(url, title = '', icon = '') {
  const t = { id: nid++, profile: S.profile, url, title, icon, manifest: '', view: null, loading: false, last: Date.now() };
  tabs.push(t); return t;
}
function newTab(url) { const t = mkTab(url ? toUrl(url) : HOME); setActive(t.id); }
function setActive(id) {
  const t = tabs.find(x => x.id === id); if (!t) return;
  act[t.profile] = id; t.last = Date.now();
  const sp = split[t.profile]; if (sp && sp.a !== id && sp.b !== id) delete split[t.profile];
  if (!t.view) mkView(t);
  place(); push();
}
function destroy(t) { if (t.view) { try { win.contentView.removeChildView(t.view); t.view.webContents.close(); } catch {} t.view = null; } }
function closeTab(id) {
  const t = tabs.find(x => x.id === id); if (!t) return;
  const list = mine(), i = list.indexOf(t);
  if (!t.url.startsWith(APPURL)) { closed.push({ url: t.url, title: t.title, icon: t.icon }); if (closed.length > 20) closed.shift(); }
  const sp = split[t.profile]; if (sp && (sp.a === id || sp.b === id)) delete split[t.profile];
  destroy(t); tabs.splice(tabs.indexOf(t), 1);
  const rest = mine();
  if (!rest.length) return newTab();
  if (act[t.profile] === id) setActive(rest[Math.max(0, i - 1)].id); else push();
}
function openInternal(page) {
  const base = APPURL + page.split('#')[0], t = mine().find(x => x.url.split('#')[0] === base);
  if (t) { if (page.includes('#')) { t.url = APPURL + page; if (t.view) t.view.webContents.loadURL(t.url); } setActive(t.id); } else newTab(APPURL + page);
}
function restore(pid) {
  const s = sess[pid];
  if (s && s.tabs && s.tabs.length) {
    const made = s.tabs.map(x => mkTab(x.url, x.title, x.icon));
    setActive(made[Math.min(s.active || 0, made.length - 1)].id);
  } else newTab();
}
function openArgs(argv) {
  for (const a of argv.slice(1)) {
    if (a.startsWith('--') || a === '.' || a === __dirname) continue;
    if (/^https?:\/\//i.test(a)) newTab(a);
    else { try { if (fs.statSync(a).isFile()) openFile(a); } catch {} }
  }
}

/* ---------- ОЗУ: бережное усыпление ---------- */
const memMB = () => app.getAppMetrics().reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024;
const tabMB = t => { try { const m = app.getAppMetrics().find(x => x.pid === t.view.webContents.getOSProcessId()); return m ? m.memory.workingSetSize / 1024 : 0; } catch { return 0; } };
// вкладку нельзя трогать: открыта сейчас, в разделённом экране, играет звук/видео, грузится
const guarded = t => t === cur() || t === partner() || t.media || t.loading || t.view.webContents.isCurrentlyAudible();
async function sleepTab(t) {
  if (!t.view) return; const wc = t.view.webContents;
  try { t.restore = await wc.executeJavaScript('({y:scrollY,v:(document.querySelector("video")||{}).currentTime||0})'); } catch {}
  destroy(t);
}
let govBusy = false;
async function governor() {
  if (govBusy) return; govBusy = true;
  try {
    const now = Date.now(), lim = budget(), idle = t => now - t.last;
    tabs.forEach(t => { if (t.view && guarded(t)) t.last = now; });
    const cands = () => tabs.filter(t => t.view && !guarded(t)).sort((x, y) => x.last - y.last);
    if (S.sleepMin) for (const t of cands()) if (idle(t) > S.sleepMin * 60000) await sleepTab(t);
    const perTab = Math.min(1000, Math.max(450, Math.round(lim / 4)));
    for (const t of cands()) if (idle(t) > 120000 && tabMB(t) > perTab) await sleepTab(t);
    for (const t of cands()) { if (memMB() <= lim * 0.95) break; if (idle(t) < 60000) continue; await sleepTab(t); }
  } finally { govBusy = false; push(); }
}
setInterval(governor, 20000);

/* ---------- загрузки ---------- */
const dls = []; let did = 0;
function uniq(p) { let q = p, i = 1; const { dir, name, ext } = path.parse(p); while (fs.existsSync(q)) q = path.join(dir, `${name} (${i++})${ext}`); return q; }
function hookDl(ses) {
  if (hooked.has(ses)) return; hooked.add(ses);
  ses.on('will-download', (e, item) => {
    const d = { id: ++did, name: item.getFilename(), total: item.getTotalBytes(), got: 0, state: 'run', path: '' };
    dls.unshift(d); if (dls.length > 30) dls.pop();
    if (!S.askDownload) { d.path = uniq(path.join(S.downloadDir || app.getPath('downloads'), item.getFilename())); item.setSavePath(d.path); }
    let last = 0;
    item.on('updated', () => { d.got = item.getReceivedBytes(); d.path = item.getSavePath() || d.path; if (Date.now() - last > 400) { last = Date.now(); bcDl(); } });
    item.once('done', (_, s) => {
      d.state = s === 'completed' ? 'ok' : 'fail'; d.path = item.getSavePath() || d.path; bcDl();
      if (d.state === 'ok') info({ text: 'Загружено: ' + d.name, btns: [['Открыть', 'open', d.path], ['В папке', 'show', d.path]], auto: 10000 });
    });
  });
}
const bcDl = () => tabs.filter(t => t.view && t.url.startsWith(APPURL)).forEach(t => { try { t.view.webContents.send('dl', dls); } catch {} });

/* ---------- инфо-полоса ---------- */
function info(o) { infoOn = true; const id = ++iid; ui('info', { id, text: o.text, btns: o.btns || [] }); place(); if (o.auto) setTimeout(() => { if (iid === id) closeInfo(); }, o.auto); }
function closeInfo() { asks.forEach(q => q.cb(false)); asks.clear(); infoOn = false; findOn = false; ui('info', null); place(); }

/* ---------- пароли ---------- */
const pwFile = p => 'pw-' + p + '.json';
const tabOf = wc => tabs.find(t => t.view && t.view.webContents === wc);
const originOf = e => { try { return new URL(e.senderFrame.url).origin; } catch { return ''; } };
ipcMain.on('pw:save', (e, d) => {
  const t = tabOf(e.sender), o = originOf(e);
  if (!t || !/^https?:/.test(o) || !safeStorage.isEncryptionAvailable() || !d || !d.pass) return;
  const list = (rd(pwFile(t.profile), {})[o] || []);
  if (list.some(x => x.u === d.user && safeStorage.decryptString(Buffer.from(x.p, 'base64')) === d.pass)) return;
  pend = { profile: t.profile, origin: o, user: d.user || '', pass: d.pass };
  info({ text: `Сохранить пароль${d.user ? ' для ' + d.user : ''} на ${new URL(o).host}?`, btns: [['Сохранить', 'pwsave'], ['Нет', 'pwno']] });
});
ipcMain.handle('pw:get', e => {
  const t = tabOf(e.sender), o = originOf(e); if (!t || !safeStorage.isEncryptionAvailable()) return null;
  const x = (rd(pwFile(t.profile), {})[o] || [])[0]; if (!x) return null;
  try { return { user: x.u, pass: safeStorage.decryptString(Buffer.from(x.p, 'base64')) }; } catch { return null; }
});
ipcMain.handle('pw:list', e => { if (!ok(e)) return []; const d = rd(pwFile(S.profile), {}); return Object.keys(d).flatMap(o => d[o].map(x => ({ origin: o, user: x.u }))); });
ipcMain.handle('pw:del', (e, o, u) => { if (!ok(e)) return; const d = rd(pwFile(S.profile), {}); d[o] = (d[o] || []).filter(x => x.u !== u); if (!d[o].length) delete d[o]; wr(pwFile(S.profile), d); });

/* ---------- сайт на рабочий стол ---------- */
function toIco(png) {
  const h = Buffer.alloc(22); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4); h[6] = 0; h[7] = 0; h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12);
  h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18); return Buffer.concat([h, png]);
}
async function siteInfo(t) {
  const wc = t.view.webContents; let i = {};
  try {
    i = await wc.executeJavaScript(`(()=>{const o=[];document.querySelectorAll('link[rel~="icon"],link[rel^="apple-touch-icon"]').forEach(l=>{const s=((l.sizes&&l.sizes.value)||'').split(' ')[0].split('x')[0]|0;o.push([s||(/apple/.test(l.rel)?180:16),l.href])});
      o.sort((a,b)=>b[0]-a[0]);const m=document.querySelector('link[rel=manifest]');return{icons:o.map(x=>x[1]),title:document.title,app:(document.querySelector('meta[name=application-name]')||{}).content||'',manifest:m?m.href:''}})()`);
  } catch {}
  const icons = [], ses = wc.session; let name = i.app || '';
  if (i.manifest) {
    try {
      const m = await (await ses.fetch(i.manifest)).json(); name = m.short_name || m.name || name;
      (m.icons || []).map(x => [parseInt(x.sizes, 10) || 0, x.src]).sort((a, b) => b[0] - a[0]).forEach(x => icons.push(new URL(x[1], i.manifest).href));
    } catch {}
  }
  icons.push(...(i.icons || []), t.icon, new URL(t.url).origin + '/favicon.ico');
  return { name: name || i.title || t.title || new URL(t.url).hostname, icons: icons.filter(Boolean), ses };
}
async function installSite() {
  const t = cur(); if (!t || !t.view || !/^https?:/.test(t.url)) return info({ text: 'Откройте сайт, чтобы установить его как приложение', auto: 4000 });
  const host = new URL(t.url).hostname, si = await siteInfo(t);
  const name = si.name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || host;
  let ico = '';
  for (const u of [...new Set(si.icons)]) {
    try {
      const r = await si.ses.fetch(u); if (!r.ok) continue;
      const data = 'data:' + (r.headers.get('content-type') || 'image/png').split(';')[0] + ';base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
      const png = await win.webContents.executeJavaScript('tile(' + JSON.stringify(data) + ')');
      if (!png) continue;
      ico = path.join(UD, 'icons', host + '.ico'); fs.mkdirSync(path.dirname(ico), { recursive: true });
      fs.writeFileSync(ico, toIco(Buffer.from(png.split(',')[1], 'base64'))); break;
    } catch {}
  }
  const args = (app.isPackaged ? '' : `"${app.getAppPath()}" `) + `"${t.url}"`;
  const done = typeof shell.writeShortcutLink === 'function' && shell.writeShortcutLink(path.join(app.getPath('desktop'), name + '.lnk'), { target: process.execPath, args, description: name, icon: ico || process.execPath, iconIndex: 0 });
  info({ text: done ? `«${name}» установлен: ярлык на рабочем столе` + (ico ? '' : ' (значок сайта найти не удалось)') : 'Ярлыки доступны только в Windows', auto: 6000 });
}

/* ---------- разрешения сайтов ---------- */
const PERMS = { media: 'Камера и микрофон', geolocation: 'Геолокация', notifications: 'Уведомления', 'clipboard-read': 'Чтение буфера обмена', midi: 'MIDI-устройства' };
const SAFE = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'mediaKeySystem', 'speaker-selection', 'storage-access', 'top-level-storage-access']);
const sesProf = new Map(); let askId = 0; const asks = new Map();
const getPerm = (p, o, k) => (((S.perms[p] || {})[o] || {})[k]) || 'ask';
function setPerm(p, o, k, v) {
  S.perms[p] = S.perms[p] || {}; S.perms[p][o] = S.perms[p][o] || {};
  if (v === 'ask') delete S.perms[p][o][k]; else S.perms[p][o][k] = v; saveS();
}
function hookPerm(ses, pid) {
  if (sesProf.has(ses)) return; sesProf.set(ses, pid);
  ses.setPermissionRequestHandler((wc, perm, cb, d) => {
    const url = d.requestingUrl || wc.getURL();
    if (url.startsWith(APPURL)) return cb(perm === 'media' || SAFE.has(perm));
    if (SAFE.has(perm)) return cb(true);
    if (!PERMS[perm]) return cb(false);
    let o; try { o = new URL(url).origin; } catch { return cb(false); }
    const v = getPerm(pid, o, perm);
    if (v !== 'ask') return cb(v === 'allow');
    const id = ++askId; asks.set(id, { cb, pid, o, perm });
    info({ text: `${new URL(o).host} просит доступ: ${PERMS[perm].toLowerCase()}`, btns: [['Разрешить', 'perm-allow', id], ['Запретить', 'perm-deny', id]] });
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => {
    if (SAFE.has(perm)) return true;
    if ((origin || '').startsWith(APPURL) || (origin || '').startsWith('file:')) return perm === 'media';
    return getPerm(pid, origin, perm) === 'allow';
  });
}
function siteMenu(x, y) {
  const t = cur(); if (!t) return;
  const web = /^https?:/.test(t.url), o = web ? new URL(t.url).origin : '';
  const tpl = [{ label: web ? new URL(t.url).host : 'Служебная страница K-search', enabled: false }, { type: 'separator' }];
  if (web) {
    const mb = t.view ? (() => { const m = app.getAppMetrics().find(m => m.pid === t.view.webContents.getOSProcessId()); return m ? Math.round(m.memory.workingSetSize / 1024) : 0; })() : 0;
    tpl.push({ label: 'Установить сайт как приложение', click: installSite },
      { label: 'Закрепить / открепить на главной', click: pinCur }, { type: 'separator' },
      { label: 'Разрешения', submenu: Object.keys(PERMS).map(k => ({ label: PERMS[k], submenu: [['ask', 'Спрашивать'], ['allow', 'Разрешить'], ['deny', 'Запретить']].map(([v, l]) =>
        ({ label: l, type: 'radio', checked: getPerm(t.profile, o, k) === v, click: () => setPerm(t.profile, o, k, v) })) })) },
      { label: 'Сбросить разрешения сайта', click: () => { if (S.perms[t.profile]) delete S.perms[t.profile][o]; saveS(); } },
      { type: 'separator' }, { label: `Память вкладки: ${mb || '—'} МБ`, enabled: false },
      { label: 'Очистить кэш', click: async () => { await t.view.webContents.session.clearCache(); info({ text: 'Кэш очищен', auto: 3000 }); } },
      { label: 'Очистить cookies и данные сайта', click: async () => { await t.view.webContents.session.clearStorageData({ origin: o }); t.view.webContents.reload(); info({ text: 'Данные сайта удалены', auto: 3000 }); } });
  }
  Menu.buildFromTemplate(tpl).popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

/* ---------- файлы ---------- */
function openFile(p) { newTab(fileRoute(p)); }
async function openDialog() {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  if (!r.canceled) r.filePaths.forEach(openFile);
}
ipcMain.handle('file:info', (e, p) => {
  if (!ok(e)) return null;
  try {
    const st = fs.statSync(p), fd = fs.openSync(p, 'r'), head = Buffer.alloc(Math.min(4096, st.size));
    fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
    let text = null;
    if (!head.includes(0) && st.size <= 4 * 1024 * 1024) text = fs.readFileSync(p, 'utf8');
    return { name: path.basename(p), size: st.size, ext: path.extname(p).slice(1), text, path: p };
  } catch { return null; }
});
ipcMain.on('file:open', (e, p) => { if (ok(e)) shell.openPath(p); });
ipcMain.on('file:show', (e, p) => { if (ok(e)) shell.showItemInFolder(p); });
ipcMain.on('file:openpath', (e, p) => { if (ok(e) && typeof p === 'string') try { if (fs.statSync(p).isFile()) openFile(p); } catch {} });
ipcMain.on('file:dialog', e => { if (ok(e)) openDialog(); });

/* ---------- ключи сервисов и голос ---------- */
const getKey = n => { try { return safeStorage.decryptString(Buffer.from(rd('keys.json', {})[n] || '', 'base64')); } catch { return ''; } };
ipcMain.handle('keys:has', e => ok(e) ? { audd: !!getKey('audd'), groq: !!getKey('groq') } : {});
ipcMain.handle('keys:set', (e, n, v) => {
  if (!ok(e) || !['audd', 'groq'].includes(n) || !safeStorage.isEncryptionAvailable()) return false;
  const d = rd('keys.json', {}); if (v) d[n] = safeStorage.encryptString(String(v).trim()).toString('base64'); else delete d[n]; wr('keys.json', d); return true;
});
ipcMain.handle('voice:song', async (e, buf) => {
  if (!ok(e)) return { err: 'denied' }; const k = getKey('audd'); if (!k) return { err: 'nokey' };
  try {
    const fd = new FormData(); fd.append('api_token', k); fd.append('file', new Blob([Buffer.from(buf)], { type: 'audio/webm' }), 'a.webm');
    const j = await (await fetch('https://api.audd.io/', { method: 'POST', body: fd })).json();
    if (j.status === 'success' && j.result) return { song: { title: j.result.title, artist: j.result.artist, url: j.result.song_link } };
    return { song: null };
  } catch { return { err: 'net' }; }
});
ipcMain.handle('voice:text', async (e, buf) => {
  if (!ok(e)) return { err: 'denied' }; const k = getKey('groq'); if (!k) return { err: 'nokey' };
  try {
    const fd = new FormData(); fd.append('model', 'whisper-large-v3-turbo'); fd.append('file', new Blob([Buffer.from(buf)], { type: 'audio/webm' }), 'a.webm');
    const j = await (await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + k }, body: fd })).json();
    return { text: (j.text || '').trim() };
  } catch { return { err: 'net' }; }
});

/* ---------- перенос из других браузеров ---------- */
ipcMain.handle('import:detect', e => ok(e) ? importer.detect() : []);
ipcMain.handle('import:run', async (e, id, opt) => {
  if (!ok(e)) return null;
  const r = await importer.run(id, opt || {}), out = { pw: 0, skipped: r.skipped, bm: 0, err: r.err };
  if (r.passwords.length) {
    if (!safeStorage.isEncryptionAvailable()) out.err = 'nocrypt';
    else {
      const d = rd(pwFile(S.profile), {});
      for (const x of r.passwords) {
        d[x.origin] = d[x.origin] || [];
        if (!d[x.origin].some(y => y.u === x.user)) { d[x.origin].push({ u: x.user, p: safeStorage.encryptString(x.pass).toString('base64') }); out.pw++; }
      }
      wr(pwFile(S.profile), d);
    }
  }
  if (r.bookmarks.length) {
    const l = S.pins[S.profile] = S.pins[S.profile] || [];
    for (const b of r.bookmarks) { if (l.length >= 24) break; if (!l.some(p => p.url === b.url)) { l.push({ url: b.url, title: b.title.slice(0, 40), icon: '' }); out.bm++; } }
    saveS(); bc();
  }
  return out;
});

/* ---------- горячие клавиши ---------- */
function findOpen() { findOn = true; infoOn = true; ui('info', { id: ++iid, find: true, text: '', btns: [] }); place(); try { win.webContents.focus(); } catch {} }
function findClose() { const t = cur(); try { t && t.view && t.view.webContents.stopFindInPage('clearSelection'); } catch {} closeInfo(); }
function reopen() { const c = closed.pop(); if (c) setActive(mkTab(c.url, c.title, c.icon).id); }
function key(e, i) {
  if (i.type !== 'keyDown') return;
  // сравниваем физические клавиши (code), поэтому работает и на русской раскладке
  const c = i.control || i.meta, sh = i.shift, code = i.code || '', t = cur(), wc = t && t.view && t.view.webContents, L = mine();
  const stop = f => { e.preventDefault(); f(); };
  if (c && !sh && code === 'KeyT') stop(() => newTab());
  else if (c && sh && code === 'KeyT') stop(reopen);
  else if (c && code === 'KeyO') stop(openDialog);
  else if (c && code === 'KeyW') stop(() => t && closeTab(t.id));
  else if (c && code === 'KeyF') stop(findOpen);
  else if ((c && code === 'KeyL') || (i.alt && code === 'KeyD') || code === 'F6') stop(() => ui('cmd', 'addr'));
  else if (c && code === 'KeyD') stop(pinCur);
  else if ((c && sh && code === 'KeyR') || (c && code === 'F5')) stop(() => wc && wc.reloadIgnoringCache());
  else if ((c && code === 'KeyR') || code === 'F5') stop(() => wc && wc.reload());
  else if (i.alt && code === 'ArrowLeft') stop(() => wc && wc.navigationHistory.goBack());
  else if (i.alt && code === 'ArrowRight') stop(() => wc && wc.navigationHistory.goForward());
  else if (c && code === 'Tab') stop(() => { const j = L.indexOf(t); setActive(L[(j + (sh ? L.length - 1 : 1)) % L.length].id); });
  else if (c && /^Digit[1-9]$/.test(code)) stop(() => { const n = +code.slice(5), x = n === 9 ? L[L.length - 1] : L[n - 1]; if (x) setActive(x.id); });
  else if (c && (code === 'Equal' || code === 'NumpadAdd')) stop(() => wc && wc.setZoomLevel(Math.min(5, wc.getZoomLevel() + .5)));
  else if (c && (code === 'Minus' || code === 'NumpadSubtract')) stop(() => wc && wc.setZoomLevel(Math.max(-5, wc.getZoomLevel() - .5)));
  else if (c && (code === 'Digit0' || code === 'Numpad0')) stop(() => wc && wc.setZoomLevel(0));
  else if (code === 'F11') stop(() => win.setFullScreen(!win.isFullScreen()));
  else if (code === 'F12') stop(() => { const w = i.control ? wc : win.webContents; w && w.openDevTools({ mode: 'detach' }); });
  else if (code === 'Escape' && findOn) stop(findClose);
}

/* ---------- настройки и IPC ---------- */
function bc() {
  try { win.setTitleBarOverlay({ color: '#00000000', symbolColor: isDark() ? '#ffffff' : '#111111', height: TOPH }); } catch {}
  [win.webContents, ...tabs.filter(t => t.view && t.url.startsWith(APPURL)).map(t => t.view.webContents)].forEach(w => { try { w.send('settings', S); } catch {} });
}
function switchProfile(id) {
  if (!S.profiles.some(p => p.id === id)) return;
  S.profile = id; saveS();
  if (!mine().length) restore(id); else setActive(act[id] && tabs.find(t => t.id === act[id]) ? act[id] : mine()[0].id);
  bc(); place(); push();
}
ipcMain.handle('settings:get', e => ok(e) ? S : null);
ipcMain.on('settings:set', (e, p) => {
  if (!ok(e) || !p) return;
  const keep = S.profile; S = merge(S, { ...p, theme: { ...S.theme, ...(p.theme || {}) }, layout: { ...S.layout, ...(p.layout || {}) } }); S.profile = keep;
  saveS(); bc(); place(); push();
});
ipcMain.on('profile:add', (e, n) => { if (!ok(e)) return; const id = Date.now().toString(36); S.profiles.push({ id, name: (n || 'Профиль').slice(0, 30) }); saveS(); bc(); switchProfile(id); });
ipcMain.on('profile:rename', (e, id, n) => { if (!ok(e)) return; const p = S.profiles.find(x => x.id === id); if (p) { p.name = String(n).slice(0, 30); saveS(); bc(); } });
ipcMain.on('profile:switch', (e, id) => { if (ok(e) || e.sender === win.webContents) switchProfile(id); });
ipcMain.on('profile:del', async (e, id) => {
  if (!ok(e) || id === 'default') return;
  if (S.profile === id) switchProfile('default');
  tabs.filter(t => t.profile === id).forEach(t => { destroy(t); tabs.splice(tabs.indexOf(t), 1); });
  S.profiles = S.profiles.filter(p => p.id !== id); delete S.pins[id]; delete sess[id]; saveSession(); saveS();
  try { await session.fromPartition('persist:p-' + id).clearStorageData(); } catch {} try { fs.unlinkSync(path.join(UD, pwFile(id))); } catch {}
  bc();
});
ipcMain.handle('mem', e => ok(e) ? { mb: Math.round(memMB()), live: tabs.filter(t => t.view).length, total: tabs.length, budget: budget(), auto: S.ram <= 0, totalMB: TOTALMB } : null);
ipcMain.handle('dl:list', e => ok(e) ? dls : []);
ipcMain.handle('dl:pick', async e => {
  if (!ok(e)) return; const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (!r.canceled) { S.downloadDir = r.filePaths[0]; saveS(); bc(); }
});
ipcMain.on('dl:open', (e, id) => { const d = dls.find(x => x.id === id); if (ok(e) && d && d.path) shell.showItemInFolder(d.path); });
ipcMain.on('pins:del', (e, url) => { if (!ok(e)) return; S.pins[S.profile] = (S.pins[S.profile] || []).filter(p => p.url !== url); saveS(); bc(); push(); });
ipcMain.on('sys:defaults', e => { if (ok(e)) shell.openExternal('ms-settings:defaultapps'); });
ipcMain.on('cmd:edit', e => { if (ok(e)) { ui('cmd', 'edit'); win.focus(); } });
ipcMain.handle('theme:export', async (e, th) => {
  if (!ok(e)) return; const r = await dialog.showSaveDialog(win, { defaultPath: 'k-search-theme.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!r.canceled) fs.writeFileSync(r.filePath, JSON.stringify(th, null, 2));
});
ipcMain.handle('theme:import', async e => {
  if (!ok(e)) return null; const r = await dialog.showOpenDialog(win, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  try { return r.canceled ? null : JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { return null; }
});

// окно интерфейса
ipcMain.on('ready', e => {
  if (e.sender !== win.webContents) return;
  ui('settings', S);
  if (!started) { started = true; if (!S.onboarded) newTab(APPURL + 'welcome.html'); else restore(S.profile); openArgs(process.argv); }
  place(); push();
});
const U = e => e.sender === win.webContents;
ipcMain.on('tab:new', e => U(e) && newTab());
ipcMain.on('tab:switch', (e, id) => U(e) && setActive(id));
ipcMain.on('tab:close', (e, id) => U(e) && closeTab(id));
ipcMain.on('nav:go', (e, u) => { if (!U(e)) return; const t = cur(); if (!t) return; t.url = toUrl(u); if (t.view) t.view.webContents.loadURL(t.url); else setActive(t.id); });
ipcMain.on('nav:back', e => U(e) && cur() && cur().view && cur().view.webContents.navigationHistory.goBack());
ipcMain.on('nav:fwd', e => U(e) && cur() && cur().view && cur().view.webContents.navigationHistory.goForward());
ipcMain.on('nav:reload', e => U(e) && cur() && cur().view && cur().view.webContents.reload());
ipcMain.on('nav:home', e => { if (U(e) && cur()) { cur().url = HOME; cur().view.webContents.loadURL(HOME); } });
ipcMain.on('lock', (e, b) => { if (U(e)) { locked = !!b; place(); } });
ipcMain.on('info:close', e => U(e) && closeInfo());
ipcMain.on('find:go', (e, txt, fwd, next) => {
  if (!U(e)) return; const t = cur(), wc = t && t.view && t.view.webContents; if (!wc) return;
  if (!txt) { wc.stopFindInPage('clearSelection'); ui('found', { n: 0, i: 0 }); return; }
  wc.findInPage(txt, { forward: fwd !== false, findNext: !!next });
});
ipcMain.on('find:close', e => U(e) && findClose());
ipcMain.on('tab:move', (e, id, idx) => {
  if (!U(e)) return; const t = mine().find(x => x.id === id); if (!t) return;
  tabs.splice(tabs.indexOf(t), 1);
  const m = mine(), ref = m[idx];
  tabs.splice(ref ? tabs.indexOf(ref) : (m.length ? tabs.indexOf(m[m.length - 1]) + 1 : tabs.length), 0, t);
  push();
});
function doSplit(id, side) {
  const a = cur(), b = tabs.find(t => t.id === id && t.profile === S.profile); if (!a || !b || a === b) return;
  if (!b.view) mkView(b); b.last = Date.now();
  split[S.profile] = side === 'left' ? { a: b.id, b: a.id } : { a: a.id, b: b.id }; place(); push();
}
const unsplit = () => { delete split[S.profile]; place(); push(); };
ipcMain.on('tab:split', (e, id, side) => U(e) && doSplit(id, side));
ipcMain.on('split:close', e => U(e) && unsplit());
ipcMain.on('tab:mute', (e, id) => { const t = tabs.find(x => x.id === id); if (U(e) && t && t.view) { t.view.webContents.setAudioMuted(!t.view.webContents.isAudioMuted()); push(); } });
ipcMain.on('tabmenu', (e, id, x, y) => {
  if (!U(e)) return; const t = tabs.find(z => z.id === id); if (!t) return;
  const wc = t.view && t.view.webContents, L = mine(), i = L.indexOf(t), sp = split[S.profile], inSp = sp && (sp.a === id || sp.b === id);
  Menu.buildFromTemplate([
    { label: 'Обновить', click: () => { if (wc) wc.reload(); else setActive(id); } },
    { label: 'Дублировать', click: () => newTab(t.url) },
    { label: wc && wc.isAudioMuted() ? 'Включить звук' : 'Отключить звук', enabled: !!wc, click: () => wc && wc.setAudioMuted(!wc.isAudioMuted()) },
    { type: 'separator' },
    inSp ? { label: 'Закрыть разделение экрана', click: unsplit } : { label: 'Разделить экран с текущей вкладкой', enabled: !!cur() && cur().id !== id, click: () => doSplit(id, 'right') },
    { type: 'separator' },
    { label: 'Закрыть', click: () => closeTab(id) },
    { label: 'Закрыть другие', click: () => L.filter(z => z.id !== id).forEach(z => closeTab(z.id)) },
    { label: 'Закрыть вкладки справа', click: () => L.slice(i + 1).forEach(z => closeTab(z.id)) }
  ]).popup({ window: win, x: Math.round(x), y: Math.round(y) });
});
ipcMain.on('info:act', (e, a, arg) => {
  if (!U(e)) return;
  if (a === 'open') shell.openPath(arg); else if (a === 'show') shell.showItemInFolder(arg);
  else if (a === 'pwsave' && pend) {
    const d = rd(pwFile(pend.profile), {}); d[pend.origin] = (d[pend.origin] || []).filter(x => x.u !== pend.user);
    d[pend.origin].unshift({ u: pend.user, p: safeStorage.encryptString(pend.pass).toString('base64') }); wr(pwFile(pend.profile), d);
  }
  if (a === 'perm-allow' || a === 'perm-deny') { const q = asks.get(arg); if (q) { asks.delete(arg); setPerm(q.pid, q.o, q.perm, a === 'perm-allow' ? 'allow' : 'deny'); q.cb(a === 'perm-allow'); } }
  if (a === 'pwsave' || a === 'pwno') pend = null;
  closeInfo();
});
function pinCur() {
  const t = cur(); if (!t || !/^https?:/.test(t.url)) return;
  const l = S.pins[S.profile] = S.pins[S.profile] || [], i = l.findIndex(p => p.url === t.url);
  if (i >= 0) l.splice(i, 1); else l.push({ url: t.url, title: t.title || new URL(t.url).hostname, icon: t.icon });
  saveS(); bc(); push();
}
ipcMain.on('pin', e => U(e) && pinCur());
ipcMain.on('site', (e, x, y) => U(e) && siteMenu(x, y));
ipcMain.on('install', e => U(e) && installSite());
ipcMain.on('pwa', (e, u) => { const t = tabOf(e.sender); if (t && /^https?:/.test(u)) { t.manifest = u; push(); } });
ipcMain.on('menu', (e, x, y) => {
  if (!U(e)) return;
  Menu.buildFromTemplate([
    { label: 'Новая вкладка', accelerator: 'Ctrl+T', click: () => newTab() },
    { label: 'Открыть файл…', accelerator: 'Ctrl+O', click: openDialog },
    { label: 'Закрепить / открепить на главной', click: pinCur },
    { label: 'Установить сайт на рабочий стол', click: installSite },
    { type: 'separator' },
    { label: 'Режим редактора', click: () => ui('cmd', 'edit') },
    { label: 'Загрузки', click: () => openInternal('settings.html#downloads') },
    { label: 'Настройки', click: () => openInternal('settings.html') },
    { type: 'separator' },
    { label: 'Заблокировать', click: () => ui('cmd', 'lock') },
    { label: 'Сделать K-search браузером по умолчанию', click: () => shell.openExternal('ms-settings:defaultapps') },
    { label: 'Выход', role: 'quit' }
  ]).popup({ window: win, x: Math.round(x), y: Math.round(y) });
});
ipcMain.on('pmenu', (e, x, y) => {
  if (!U(e)) return;
  Menu.buildFromTemplate([
    ...S.profiles.map(p => ({ label: p.name, type: 'radio', checked: p.id === S.profile, click: () => switchProfile(p.id) })),
    { type: 'separator' }, { label: 'Управление профилями…', click: () => openInternal('settings.html#profiles') }
  ]).popup({ window: win, x: Math.round(x), y: Math.round(y) });
});

/* ---------- старт ---------- */
app.on('second-instance', (_, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); openArgs(argv); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 720, minHeight: 480, show: false, frame: false, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: TOPH }, backgroundColor: '#0d1311',
    icon: path.join(__dirname, 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
  win.on('resize', place); win.on('enter-full-screen', place); win.on('leave-full-screen', place);
  win.webContents.on('before-input-event', key);
});
app.on('window-all-closed', () => app.quit());

module.exports._t = { key, governor, doSplit, get tabs() { return tabs; }, budget, S: () => S, cur };
