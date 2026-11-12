const { app, BrowserWindow, WebContentsView, ipcMain, Menu, shell, safeStorage, dialog, net, nativeImage, session, nativeTheme } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const UD = app.getPath('userData');

/* ---------- настройки ---------- */
const DEF = {
  theme: { preset: 'emerald', mode: 'dark', c: ['#10a371', '#14a39a', '#0b3b47'], angle: 150, glass: .14, blur: 22 },
  saved: [], ram: 500, sleepMin: 10, lite: false, engine: 'google', downloadDir: '', askDownload: false, font: '', radius: 16,
  layout: { tabs: 'top', bar: 'top', order: ['back', 'fwd', 'reload', 'home', 'addr', 'pin', 'lock', 'prof', 'menu'], hidden: [] },
  profiles: [{ id: 'default', name: 'Основной' }], profile: 'default', pins: {}
};
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(UD, f), 'utf8')); } catch { return d; } };
const wr = (f, o) => { try { fs.mkdirSync(UD, { recursive: true }); fs.writeFileSync(path.join(UD, f), JSON.stringify(o)); } catch {} };
const merge = (d, s) => ({ ...d, ...s, theme: { ...d.theme, ...(s.theme || {}) }, layout: { ...d.layout, ...(s.layout || {}) } });
let S = merge(DEF, rd('settings.json', {}));
const saveS = () => wr('settings.json', S);

/* ---------- производительность (до старта) ---------- */
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=' + Math.max(96, Math.round(S.ram / 4)));
app.commandLine.appendSwitch('renderer-process-limit', '6');
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
let win, tabs = [], act = {}, nid = 1, locked = false, infoOn = false, iid = 0, pend = null, started = false;
const sess = rd('session.json', {});

function toUrl(s) {
  s = (s || '').trim();
  if (!s) return HOME;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data):/i.test(s)) return s;
  if (/^[a-z]:[\\/]/i.test(s)) return pathToFileURL(s).href;
  if (!/\s/.test(s) && /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
  return ENGINES[S.engine] + encodeURIComponent(s);
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
function place() {
  if (!win) return;
  const [W, H] = win.getContentSize(), i = insets(), a = cur();
  for (const t of tabs) {
    if (!t.view) continue;
    const show = t === a && !locked;
    t.view.setVisible(show);
    if (show) t.view.setBounds({ x: i.l, y: i.t, width: Math.max(0, W - i.l), height: Math.max(0, H - i.t - i.b) });
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
      pinned: !!(a && (S.pins[S.profile] || []).some(p => p.url === a.url)),
      tabs: mine().map(t => ({ id: t.id, title: t.title || 'Новая вкладка', icon: t.icon, loading: t.loading, sleep: !t.view,
        url: t.url.startsWith(APPURL) ? '' : t.url }))
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
  hookDl(ses);
  const v = new WebContentsView({ webPreferences: { session: ses, sandbox: true, preload: path.join(__dirname, 'tab-preload.js'),
    additionalArguments: ['--app-url=' + APPURL], plugins: true, backgroundThrottling: true, spellcheck: false } });
  t.view = v; win.contentView.addChildView(v);
  const wc = v.webContents;
  wc.on('page-title-updated', (_, ti) => { t.title = ti; push(); });
  wc.on('did-navigate', (_, u) => { t.url = u; push(); });
  wc.on('did-navigate-in-page', (_, u, main) => { if (main) { t.url = u; push(); } });
  wc.on('did-start-loading', () => { t.loading = true; push(); });
  wc.on('did-stop-loading', () => { t.loading = false; push(); });
  wc.on('page-favicon-updated', (_, f) => { t.icon = f[0] || ''; push(); });
  wc.on('before-input-event', key);
  wc.on('did-fail-load', (_, code, desc, u, main) => {
    if (main && code !== -3) wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      `<body style="font:16px system-ui;background:#111a17;color:#eaf4f0;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Не удалось открыть страницу</h2><p style="opacity:.6;margin-top:8px">${desc}</p></div>`));
  });
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' }; });
  wc.loadURL(t.url);
}
function mkTab(url, title = '', icon = '') {
  const t = { id: nid++, profile: S.profile, url, title, icon, view: null, loading: false, last: Date.now() };
  tabs.push(t); return t;
}
function newTab(url) { const t = mkTab(url ? toUrl(url) : HOME); setActive(t.id); }
function setActive(id) {
  const t = tabs.find(x => x.id === id); if (!t) return;
  act[t.profile] = id; t.last = Date.now();
  if (!t.view) mkView(t);
  place(); push();
}
function destroy(t) { if (t.view) { try { win.contentView.removeChildView(t.view); t.view.webContents.close(); } catch {} t.view = null; } }
function closeTab(id) {
  const t = tabs.find(x => x.id === id); if (!t) return;
  const list = mine(), i = list.indexOf(t);
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
    else { try { if (fs.statSync(a).isFile()) newTab(pathToFileURL(a).href); } catch {} }
  }
}

/* ---------- ОЗУ: усыпление вкладок ---------- */
const memMB = () => app.getAppMetrics().reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024;
setInterval(() => {
  const now = Date.now(), a = cur();
  const cand = tabs.filter(t => t.view && t !== a).sort((x, y) => x.last - y.last);
  if (S.sleepMin) cand.filter(t => now - t.last > S.sleepMin * 60000).forEach(t => { destroy(t); });
  if (memMB() > S.ram) { const t = cand.find(t => t.view && now - t.last > 20000); if (t) destroy(t); }
  push();
}, 15000);

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
function closeInfo() { infoOn = false; ui('info', null); place(); }

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
function toIco(png, s) {
  const h = Buffer.alloc(22); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4); h[6] = s; h[7] = s; h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12);
  h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18); return Buffer.concat([h, png]);
}
async function installSite() {
  const t = cur(); if (!t || !/^https?:/.test(t.url)) return info({ text: 'Откройте сайт, чтобы создать ярлык', auto: 4000 });
  const host = new URL(t.url).hostname, name = (t.title || host).replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || host;
  let ico = '';
  try {
    if (t.icon) {
      const r = await net.fetch(t.icon), img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
      if (!img.isEmpty()) { ico = path.join(UD, 'icons', host + '.ico'); fs.mkdirSync(path.dirname(ico), { recursive: true }); fs.writeFileSync(ico, toIco(img.resize({ width: 64, height: 64, quality: 'best' }).toPNG(), 64)); }
    }
  } catch { ico = ''; }
  const args = (app.isPackaged ? '' : `"${app.getAppPath()}" `) + `"${t.url}"`;
  const done = shell.writeShortcutLink(path.join(app.getPath('desktop'), name + '.lnk'), { target: process.execPath, args, description: t.title || host, icon: ico || process.execPath, iconIndex: 0 });
  info({ text: done ? `Ярлык «${name}» создан на рабочем столе` : 'Ярлыки доступны только в Windows', auto: 5000 });
}

/* ---------- горячие клавиши ---------- */
function key(e, i) {
  if (i.type !== 'keyDown') return;
  const c = i.control || i.meta, k = i.key.toLowerCase(), wc = cur() && cur().view && cur().view.webContents, L = mine();
  const stop = f => { e.preventDefault(); f(); };
  if (c && k === 't') stop(() => newTab());
  else if (c && k === 'w') stop(() => cur() && closeTab(cur().id));
  else if ((c && k === 'l') || (i.alt && k === 'd')) stop(() => ui('cmd', 'addr'));
  else if ((c && k === 'r') || k === 'f5') stop(() => wc && wc.reload());
  else if (i.alt && k === 'arrowleft') stop(() => wc && wc.navigationHistory.goBack());
  else if (i.alt && k === 'arrowright') stop(() => wc && wc.navigationHistory.goForward());
  else if (c && k === 'tab') stop(() => { const j = L.indexOf(cur()); setActive(L[(j + (i.shift ? L.length - 1 : 1)) % L.length].id); });
  else if (k === 'f12') stop(() => (i.control ? wc : win.webContents) && (i.control ? wc : win.webContents).openDevTools({ mode: 'detach' }));
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
ipcMain.handle('mem', e => ok(e) ? { mb: Math.round(memMB()), live: tabs.filter(t => t.view).length, total: tabs.length } : null);
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
  if (!started) { started = true; restore(S.profile); openArgs(process.argv); }
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
ipcMain.on('info:act', (e, a, arg) => {
  if (!U(e)) return;
  if (a === 'open') shell.openPath(arg); else if (a === 'show') shell.showItemInFolder(arg);
  else if (a === 'pwsave' && pend) {
    const d = rd(pwFile(pend.profile), {}); d[pend.origin] = (d[pend.origin] || []).filter(x => x.u !== pend.user);
    d[pend.origin].unshift({ u: pend.user, p: safeStorage.encryptString(pend.pass).toString('base64') }); wr(pwFile(pend.profile), d);
  }
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
ipcMain.on('menu', (e, x, y) => {
  if (!U(e)) return;
  Menu.buildFromTemplate([
    { label: 'Новая вкладка', accelerator: 'Ctrl+T', click: () => newTab() },
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
  win.on('resize', place);
  win.webContents.on('before-input-event', key);
});
app.on('window-all-closed', () => app.quit());
