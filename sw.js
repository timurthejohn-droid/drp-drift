// Расшифровка сайта DRP на лету. Версия выкладки 20261125040150
const BASE = "/drp-drift/", V = "20261125040150";
const PASS = /^(sw\.js|x\/|robots\.txt|404\.html|\.nojekyll)$|^x\//;
let K = null, M = null;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
function db(mode, fn) {
  return new Promise((ok, no) => {
    const r = indexedDB.open('drp-gate', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => no(r.error);
    r.onsuccess = () => { const tx = r.result.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); };
  });
}
async function key() {
  if (K) return K;
  const v = await db('readonly', (s) => s.get('k'));
  if (!v || v.exp < Date.now()) return null;
  return (K = v.key);
}
const dec = (k, buf) => { const u = new Uint8Array(buf); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, k, u.slice(12)); };
async function manifest(k, fresh) {
  if (M && !fresh) return M;
  const r = await fetch(BASE + 'x/m.bin?v=' + V + (fresh ? '&t=' + Date.now() : ''), { cache: fresh ? 'no-store' : 'no-cache' });
  M = JSON.parse(new TextDecoder().decode(await dec(k, await r.arrayBuffer())));
  return M;
}
// файл по записи манифеста; после новой выкладки старые имена пропадают: перечитываем манифест и пробуем еще раз
async function load(k, req, rel, fresh) {
  const m = await manifest(k, fresh);
  let ent = m.files[rel];
  if (!ent && req.mode === 'navigate') ent = m.files['index.html'];
  if (!ent) return null;
  const r = await fetch(BASE + 'x/' + ent.id + '.bin');
  if (!r.ok) return fresh ? Promise.reject(new Error('fetch ' + r.status)) : load(k, req, rel, true);
  return { ent, body: await dec(k, await r.arrayBuffer()) };
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  let rel = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname === BASE.slice(0, -1) ? '' : url.pathname.slice(1);
  try { rel = decodeURIComponent(rel); } catch (x) {}
  if (PASS.test(rel)) return;
  e.respondWith(handle(req, rel));
});
async function handle(req, rel) {
  let k;
  try { k = await key(); } catch (x) { k = null; }
  if (!k) return fetch(req);
  try {
    const got = await load(k, req, rel, false);
    if (!got) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
    return new Response(got.body, { headers: { 'Content-Type': got.ent.type, 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } });
  } catch (x) {
    // ключ не подходит к этой выкладке (сменили пароль): забываем его, страница покажет вход
    if (x && x.name === 'OperationError') { K = null; M = null; try { await db('readwrite', (s) => s.delete('k')); } catch (y) {} }
    return fetch(req);
  }
}
