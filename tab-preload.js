const { contextBridge, ipcRenderer } = require('electron');
const base = (process.argv.find(a => a.startsWith('--app-url=')) || '').slice(10);
const here = () => location.href;
// Внутренние страницы (главная, настройки): ограниченный API
if (base && here().startsWith(base)) {
  const OK = new Set(['settings:get', 'settings:set', 'profile:add', 'profile:del', 'profile:rename', 'profile:switch', 'pw:list', 'pw:del',
    'dl:list', 'dl:pick', 'dl:open', 'mem', 'pins:del', 'cmd:edit', 'sys:defaults', 'theme:export', 'theme:import']);
  contextBridge.exposeInMainWorld('ks', {
    invoke: (c, ...a) => OK.has(c) ? ipcRenderer.invoke(c, ...a) : Promise.reject(new Error('denied')),
    send: (c, ...a) => { if (OK.has(c)) ipcRenderer.send(c, ...a); },
    on: (c, f) => { if (c === 'settings' || c === 'dl') ipcRenderer.on(c, (_, d) => f(d)); }
  });
}
// Менеджер паролей на обычных сайтах
if (/^https?:$/.test(location.protocol)) {
  const userField = (p, root) => {
    const all = [...root.querySelectorAll('input')], i = all.indexOf(p);
    for (let j = i - 1; j >= 0; j--) if (['text', 'email', 'tel', ''].includes(all[j].type || 'text') && all[j].offsetParent) return all[j];
    return null;
  };
  const setv = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  addEventListener('submit', e => {
    const f = e.target, p = f && f.querySelector && f.querySelector('input[type=password]');
    if (p && p.value) { const u = userField(p, f); ipcRenderer.send('pw:save', { user: u ? u.value : '', pass: p.value }); }
  }, true);
  addEventListener('DOMContentLoaded', async () => {
    const p = document.querySelector('input[type=password]'); if (!p) return;
    const c = await ipcRenderer.invoke('pw:get'); if (!c) return;
    const u = userField(p, p.form || document);
    if (u && !u.value) setv(u, c.user); if (!p.value) setv(p, c.pass);
  });
}
