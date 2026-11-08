// IndexedDB: biblioteca, playlists, áudio guardado (offline e cache), rádios e podcasts favoritos.
let db = null;
const STORES = ['tracks', 'playlists', 'audio', 'radios', 'podcasts'];

export function openDB() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('vinil-de-bolso', 2);
      r.onupgradeneeded = () => { const d = r.result; for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
      r.onsuccess = () => { db = r.result; res(true); };
      r.onerror = () => res(false); r.onblocked = () => res(false);
      setTimeout(() => res(!!db), 5000);
    } catch (e) { res(false); }
  });
}
export const hasDB = () => !!db;

function req(store, mode, fn) {
  return new Promise((res, rej) => {
    if (!db) return res(undefined);
    try {
      const t = db.transaction(store, mode), q = fn(t.objectStore(store));
      t.oncomplete = () => res(q && 'result' in q ? q.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    } catch (e) { rej(e); }
  });
}
export const all = s => req(s, 'readonly', o => o.getAll()).then(r => r || []);
export const get = (s, k) => req(s, 'readonly', o => o.get(k));
export const put = (s, v) => req(s, 'readwrite', o => o.put(v));
export const del = (s, k) => req(s, 'readwrite', o => o.delete(k));
export const keys = s => req(s, 'readonly', o => o.getAllKeys()).then(r => r || []);

// Metadados do áudio guardado sem carregar os blobs para a memória.
export function audioIndex() {
  return new Promise(res => {
    if (!db) return res([]);
    const out = [];
    try {
      const c = db.transaction('audio', 'readonly').objectStore('audio').openCursor();
      c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); const v = cur.value; out.push({ id: v.id, kind: v.kind, size: v.size, used: v.used }); cur.continue(); };
      c.onerror = () => res(out);
    } catch (e) { res(out); }
  });
}
export function putMany(s, arr) {
  return new Promise((res, rej) => {
    if (!db || !arr.length) return res();
    try { const t = db.transaction(s, 'readwrite'), o = t.objectStore(s); for (const v of arr) o.put(v); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }
    catch (e) { rej(e); }
  });
}
export function delMany(s, ks) {
  return new Promise((res, rej) => {
    if (!db || !ks.length) return res();
    try { const t = db.transaction(s, 'readwrite'), o = t.objectStore(s); for (const k of ks) o.delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }
    catch (e) { rej(e); }
  });
}
