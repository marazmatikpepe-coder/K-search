const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

app.commandLine.appendSwitch('enable-low-end-device-mode');
app.commandLine.appendSwitch('renderer-process-limit', '4');
app.commandLine.appendSwitch('disk-cache-size', String(50 * 1024 * 1024));

const HOME = pathToFileURL(path.join(__dirname, 'search.html')).href; // K-search
const TOP = 96;
const ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  ddg: 'https://duckduckgo.com/?q=',
  yandex: 'https://yandex.com/search/?text=',
  brave: 'https://search.brave.com/search?q='
};
let engine = 'google', win, tabs = [], active = null, nid = 1, overlay = false;

function toUrl(s) {
  s = (s || '').trim();
  if (/^[a-z]+:\/\//i.test(s)) return s;
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
  return ENGINES[engine] + encodeURIComponent(s);
}

function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  tabs.forEach(t => t.view.setBounds(
    t.id === active && !overlay
      ? { x: 0, y: TOP, width: w, height: Math.max(0, h - TOP) }
      : { x: 0, y: TOP, width: 0, height: 0 }));
}

function push() {
  try {
    win.webContents.send('tabs', {
      active,
      tabs: tabs.map(t => {
        const wc = t.view.webContents, nh = wc.navigationHistory;
        return {
          id: t.id, title: wc.getTitle() || 'Новая вкладка',
          url: wc.getURL().startsWith('file:') ? '' : wc.getURL(),
          loading: wc.isLoading(), icon: t.icon,
          back: nh ? nh.canGoBack() : wc.canGoBack(), fwd: nh ? nh.canGoForward() : wc.canGoForward()
        };
      })
    });
  } catch (e) { console.error('push', e); }
}

function newTab(url) {
  try {
    const view = new WebContentsView({ webPreferences: { sandbox: true, backgroundThrottling: true } });
    const tab = { id: nid++, view, icon: '' };
    tabs.push(tab);
    win.contentView.addChildView(view);
    const wc = view.webContents;
    ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']
      .forEach(e => wc.on(e, push));
    wc.on('page-favicon-updated', (_, f) => { tab.icon = f[0] || ''; push(); });
    wc.on('did-fail-load', (_, code, desc, u, main) => {
      if (main && code !== -3) wc.loadURL('data:text/html,' + encodeURIComponent(
        `<body style="font:16px system-ui;background:#111;color:#fff;display:grid;place-items:center;height:100vh"><div>Не удалось открыть страницу<br><small>${desc}</small></div>`));
    });
    wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' }; });
    wc.loadURL(url ? toUrl(url) : HOME + '#e=' + engine);
    switchTab(tab.id);
  } catch (e) { console.error('newTab', e); }
}

function switchTab(id) { active = id; layout(); push(); }

function closeTab(id) {
  const i = tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  win.contentView.removeChildView(t.view);
  t.view.webContents.close();
  if (!tabs.length) return newTab();
  if (active === id) switchTab(tabs[Math.max(0, i - 1)].id); else push();
}

const cur = () => tabs.find(t => t.id === active)?.view.webContents;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 480,
    frame: false, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 44 },
    backgroundColor: '#0b0b12',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('index.html');
  win.on('resize', layout);
  // F12 — консоль интерфейса, Ctrl+F12 — консоль текущей вкладки
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.key === 'F12') (i.control ? cur() : win.webContents)?.openDevTools({ mode: 'detach' });
  });

  ipcMain.on('ready', () => { if (!tabs.length) newTab(); else push(); });
  ipcMain.on('engine', (_, e) => { if (ENGINES[e]) engine = e; });
  ipcMain.on('tab:new', () => newTab());
  ipcMain.on('tab:switch', (_, id) => switchTab(id));
  ipcMain.on('tab:close', (_, id) => closeTab(id));
  ipcMain.on('nav:go', (_, u) => cur()?.loadURL(toUrl(u)));
  ipcMain.on('nav:back', () => cur()?.navigationHistory.goBack());
  ipcMain.on('nav:fwd', () => cur()?.navigationHistory.goForward());
  ipcMain.on('nav:reload', () => cur()?.reload());
  ipcMain.on('nav:home', () => cur()?.loadURL(HOME + '#e=' + engine));
  ipcMain.on('overlay', (_, b) => { overlay = !!b; layout(); });
});

app.on('window-all-closed', () => app.quit());
