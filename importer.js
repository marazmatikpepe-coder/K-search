// Перенос паролей и закладок из Chromium-браузеров (Chrome, Edge, Brave, Яндекс, Opera, Vivaldi)
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { execFile } = require('child_process');
const L = process.env.LOCALAPPDATA || '', R = process.env.APPDATA || '';
const BR = L || R ? [
  ['chrome', 'Google Chrome', path.join(L, 'Google', 'Chrome', 'User Data')],
  ['edge', 'Microsoft Edge', path.join(L, 'Microsoft', 'Edge', 'User Data')],
  ['brave', 'Brave', path.join(L, 'BraveSoftware', 'Brave-Browser', 'User Data')],
  ['yandex', 'Яндекс Браузер', path.join(L, 'Yandex', 'YandexBrowser', 'User Data')],
  ['vivaldi', 'Vivaldi', path.join(L, 'Vivaldi', 'User Data')],
  ['opera', 'Opera', path.join(R, 'Opera Software', 'Opera Stable'), true],
  ['operagx', 'Opera GX', path.join(R, 'Opera Software', 'Opera GX Stable'), true]
] : [];
const find = id => BR.find(b => b[0] === id);
const prof = b => b[3] ? b[2] : path.join(b[2], 'Default');
const detect = () => BR.filter(b => fs.existsSync(prof(b))).map(b => ({ id: b[0], name: b[1] }));

const dpapi = b64 => new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `Add-Type -AssemblyName System.Security;[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b64}'),$null,'CurrentUser'))`],
  { timeout: 20000, windowsHide: true }, (e, o) => e ? rej(e) : res(Buffer.from(o.trim(), 'base64'))));
async function masterKey(b) {
  const ls = JSON.parse(fs.readFileSync(path.join(b[2], 'Local State'), 'utf8'));
  return dpapi(Buffer.from(ls.os_crypt.encrypted_key, 'base64').subarray(5).toString('base64'));
}
function decrypt(buf, key) {
  const p = buf.subarray(0, 3).toString();
  if (p !== 'v10' && p !== 'v11') return null; // v20 (app-bound) расшифровать нельзя
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(3, 15));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(15, buf.length - 16)), d.final()]).toString('utf8');
}
async function openDb(file) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve('sql.js')), f) });
  const tmp = path.join(os.tmpdir(), 'ks-' + Date.now() + '.db');
  fs.copyFileSync(file, tmp);
  try { return new SQL.Database(fs.readFileSync(tmp)); } finally { try { fs.unlinkSync(tmp); } catch {} }
}
async function passwords(b, keyFn) {
  const key = await keyFn(b), db = await openDb(path.join(prof(b), 'Login Data')), out = [];
  let skipped = 0;
  const r = db.exec('SELECT origin_url, username_value, password_value FROM logins');
  for (const [url, user, blob] of (r[0] ? r[0].values : [])) {
    try {
      const o = new URL(url).origin; if (!/^https?:/.test(o)) continue;
      const pass = decrypt(Buffer.from(blob), key);
      if (pass == null || !pass) { skipped++; continue; }
      out.push({ origin: o, user: user || '', pass });
    } catch { skipped++; }
  }
  db.close(); return { list: out, skipped };
}
function bookmarks(b) {
  const out = [];
  try {
    const j = JSON.parse(fs.readFileSync(path.join(prof(b), 'Bookmarks'), 'utf8'));
    const walk = n => { if (n.type === 'url' && /^https?:/.test(n.url)) out.push({ url: n.url, title: n.name || n.url }); (n.children || []).forEach(walk); };
    Object.values(j.roots || {}).forEach(r => r && r.children && walk(r));
  } catch {}
  return out;
}
async function run(id, opt, keyFn = masterKey) {
  const b = find(id); if (!b) throw new Error('browser');
  const res = { passwords: [], skipped: 0, bookmarks: [], err: '' };
  if (opt.bookmarks) res.bookmarks = bookmarks(b);
  if (opt.passwords) {
    try { const p = await passwords(b, keyFn); res.passwords = p.list; res.skipped = p.skipped; }
    catch (e) { res.err = /EBUSY|EPERM|locked/i.test(String(e)) ? 'busy' : 'fail'; }
  }
  return res;
}
module.exports = { detect, run, _t: { decrypt, passwords, bookmarks } };
