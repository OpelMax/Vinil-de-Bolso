// Fila de reprodução, carregamento das faixas (aparelho, Drive, streaming) e controles da tela bloqueada.
import * as DB from './db.js';
import * as Drive from './drive.js';
import { lsGet, lsSet } from './util.js';

export const au = document.getElementById('au');
export const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export const Q = { base: [], queue: [], idx: -1, shuffle: false, repeat: 'off', loading: false, items: new Map(), resumeAt: null };
let lookup = () => null;
export function setLookup(fn) { lookup = fn; }
// Itens tocados fora da biblioteca (rádios, Jamendo, episódios) ficam guardados aqui enquanto estão na fila.
export const byId = id => lookup(id) || Q.items.get(id);
export const curId = () => Q.queue[Q.idx];
export const cur = () => byId(curId());

/* ---------- áudio guardado no aparelho ---------- */
export const audioMeta = new Map(); // id -> {kind:'offline'|'local'|'cache', size, used}
export let cacheLimit = lsGet('vdb-cache-limit', 500) * 1048576;
export function setCacheLimit(mb) { cacheLimit = mb * 1048576; lsSet('vdb-cache-limit', mb); evict(); }
export async function loadAudioIndex() { for (const a of await DB.audioIndex()) audioMeta.set(a.id, a); }
export async function storeAudio(id, blob, kind) {
  const prev = audioMeta.get(id);
  if (prev && prev.kind !== 'cache' && kind === 'cache') kind = prev.kind;
  const rec = { id, blob, kind, size: blob.size, used: Date.now() };
  await DB.put('audio', rec);
  audioMeta.set(id, { id, kind, size: blob.size, used: rec.used });
  if (kind === 'cache') evict();
  emit('storage');
}
export async function setAudioKind(id, kind) {
  const rec = await DB.get('audio', id); if (!rec) return false;
  rec.kind = kind; await DB.put('audio', rec); audioMeta.set(id, { id, kind, size: rec.size, used: rec.used }); emit('storage'); return true;
}
export async function dropAudio(id) { await DB.del('audio', id); audioMeta.delete(id); mem.delete(id); emit('storage'); }
export async function evict() {
  const cached = [...audioMeta.values()].filter(a => a.kind === 'cache').sort((a, b) => a.used - b.used);
  let total = cached.reduce((s, a) => s + a.size, 0);
  const keep = new Set(Q.queue.slice(Math.max(0, Q.idx), Q.idx + 3));
  for (const a of cached) { if (total <= cacheLimit) break; if (keep.has(a.id)) continue; await DB.del('audio', a.id); audioMeta.delete(a.id); total -= a.size; }
  emit('storage');
}
export async function clearCache() { for (const a of [...audioMeta.values()]) if (a.kind === 'cache') { await DB.del('audio', a.id); audioMeta.delete(a.id); } emit('storage'); }
export const storedBytes = kind => [...audioMeta.values()].filter(a => !kind || a.kind === kind).reduce((s, a) => s + a.size, 0);
export const isOffline = id => { const a = audioMeta.get(id); return !!a && (a.kind === 'offline' || a.kind === 'local'); };

/* ---------- carregamento ---------- */
const mem = new Map(); // id -> objectURL de blobs já carregados (no máximo alguns)
const pending = new Map(); // id -> Promise<url>
function remember(id, url) {
  mem.set(id, url);
  const keep = new Set(Q.queue.slice(Math.max(0, Q.idx - 1), Q.idx + 3));
  for (const [k, u] of mem) if (mem.size > 4 && !keep.has(k)) { URL.revokeObjectURL(u); mem.delete(k); }
}
export function resolve(t) {
  if (t.src === 'radio' || t.src === 'jamendo' || t.src === 'podcast') return Promise.resolve(t.url);
  if (mem.has(t.id)) return Promise.resolve(mem.get(t.id));
  if (pending.has(t.id)) return pending.get(t.id);
  const p = (async () => {
    const rec = audioMeta.has(t.id) ? await DB.get('audio', t.id) : null;
    let blob = rec?.blob;
    if (rec) { rec.used = Date.now(); DB.put('audio', rec).catch(() => { }); audioMeta.set(t.id, { ...audioMeta.get(t.id), used: rec.used }); }
    if (!blob) {
      if (t.src !== 'drive') throw new Error('O arquivo desta música não está mais no aparelho.');
      blob = await Drive.download(t.fileId, t.mime);
      storeAudio(t.id, blob, 'cache').catch(() => { });
      emit('downloaded', t.id);
    }
    const url = URL.createObjectURL(blob); remember(t.id, url); return url;
  })().finally(() => pending.delete(t.id));
  pending.set(t.id, p);
  return p;
}
// Deixa as próximas faixas do Drive prontas enquanto a atual toca (assim continua tocando com a tela bloqueada).
function prefetch() {
  for (const id of Q.queue.slice(Q.idx + 1, Q.idx + 3)) {
    const t = byId(id); if (t && t.src === 'drive' && !mem.has(id)) resolve(t).catch(() => { });
  }
  if (Q.repeat === 'all' && Q.idx >= Q.queue.length - 2) { const t = byId(Q.queue[0]); if (t?.src === 'drive') resolve(t).catch(() => { }); }
}

// O iPhone só deixa tocar som após um toque; tocar um silêncio no primeiro toque "destrava" o player.
const SILENT = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
let unlocked = false;
export function unlock() { if (unlocked) return; unlocked = true; try { if (!au.src) { au.src = SILENT; au.play().catch(() => { }); } } catch (e) { } }

let loadSeq = 0;
async function load(autoplay) {
  const t = cur(); if (!t) return;
  const seq = ++loadSeq;
  Q.loading = true; emit('change'); updateSession(t);
  try {
    const url = await resolve(t);
    if (seq !== loadSeq) return;
    au.src = url;
    let pos = t.src === 'podcast' ? lsGet('vdb-pos', {})[t.id] || 0 : 0;
    if (Q.resumeAt?.id === t.id) { pos = Q.resumeAt.t; Q.resumeAt = null; }
    if (pos > 5 && !t.live) au.addEventListener('loadedmetadata', () => { au.currentTime = pos; }, { once: true });
    if (autoplay) await au.play().catch(e => { if (e.name !== 'AbortError') emit('blocked'); });
  } catch (e) {
    if (seq !== loadSeq) return;
    if (e.needAuth) emit('needauth', e); else emit('error', e);
    au.pause();
  } finally {
    if (seq === loadSeq) { Q.loading = false; emit('change'); prefetch(); }
  }
}

function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function keepItems(list) { for (const t of list) if (t && !lookup(t.id)) Q.items.set(t.id, t); }

export function playList(tracks, start = 0, shuffle = Q.shuffle) {
  tracks = tracks.filter(Boolean); if (!tracks.length) return;
  unlock(); keepItems(tracks);
  const ids = tracks.map(t => t.id);
  Q.base = ids.slice();
  if (shuffle && !tracks[0].live) { const first = ids[start], rest = ids.filter((_, i) => i !== start); Q.queue = [first, ...shuffleArr(rest)]; Q.idx = 0; }
  else { Q.queue = ids.slice(); Q.idx = start; }
  saveQueue(); load(true);
}
export function jump(i) { if (i < 0 || i >= Q.queue.length) return; unlock(); Q.idx = i; saveQueue(); load(true); }
export function next(auto) {
  if (!Q.queue.length) return;
  savePos();
  if (Q.idx < Q.queue.length - 1) Q.idx++;
  else if (Q.repeat === 'all' || !auto) Q.idx = 0;
  else { au.pause(); au.currentTime = 0; emit('change'); return; }
  saveQueue(); load(true);
}
export function prev() {
  if (!Q.queue.length) return;
  if (au.currentTime > 3 || cur()?.live) { if (!cur()?.live) au.currentTime = 0; return; }
  savePos(); Q.idx = Math.max(0, Q.idx - 1); saveQueue(); load(true);
}
export function toggle() {
  const t = cur(); if (!t) return;
  unlock();
  if (au.paused) {
    if (!au.src || au.src === SILENT || au.error) load(true);
    else if (t.live) { load(true); } // rádio: reconecta para voltar ao "ao vivo"
    else au.play().catch(() => load(true));
  } else au.pause();
}
export function setShuffle(on) {
  Q.shuffle = on; const id = curId();
  if (id) {
    if (on) { const rest = Q.queue.filter((x, i) => i !== Q.idx); Q.queue = [id, ...shuffleArr(rest)]; Q.idx = 0; }
    else { const b = Q.base.length ? Q.base.slice() : Q.queue.slice(); Q.queue.filter(x => !b.includes(x)).forEach(x => b.push(x)); Q.queue = b; Q.idx = Math.max(0, b.indexOf(id)); }
  }
  saveQueue(); emit('change'); prefetch();
}
export function cycleRepeat() { Q.repeat = Q.repeat === 'off' ? 'all' : Q.repeat === 'all' ? 'one' : 'off'; emit('change'); return Q.repeat; }
export function playNext(t) { keepItems([t]); if (!cur()) return playList([t], 0, false); Q.queue.splice(Q.idx + 1, 0, t.id); saveQueue(); emit('change'); prefetch(); }
export function addQueue(t) { keepItems([t]); if (!cur()) return playList([t], 0, false); Q.queue.push(t.id); saveQueue(); emit('change'); }
export function removeFromQueue(id) {
  const wasCur = curId() === id;
  const before = Q.queue.slice(0, Q.idx).filter(x => x === id).length;
  Q.queue = Q.queue.filter(x => x !== id); Q.base = Q.base.filter(x => x !== id); Q.idx -= before;
  if (wasCur) { au.pause(); if (Q.queue.length) { Q.idx = Math.min(Q.idx, Q.queue.length - 1); load(false); } else { Q.idx = -1; au.removeAttribute('src'); } }
  saveQueue(); emit('change');
}

/* ---------- lembrar fila e posição de podcasts ---------- */
function saveQueue() {
  const items = Q.queue.slice(0, 300).map(byId).filter(t => t && !lookup(t.id)).map(t => { const { cover, ...rest } = t; return rest; });
  lsSet('vdb-queue', { queue: Q.queue.slice(0, 300), idx: Q.idx, base: Q.base.slice(0, 300), items });
}
export function restoreQueue() {
  const s = lsGet('vdb-queue'); if (!s || !s.queue?.length) return;
  for (const t of s.items || []) Q.items.set(t.id, t);
  Q.queue = s.queue.filter(id => byId(id)); Q.base = (s.base || []).filter(id => byId(id));
  Q.idx = Math.min(Math.max(0, s.idx), Q.queue.length - 1);
  if (!Q.queue.length) Q.idx = -1;
  emit('change');
}
function savePos() {
  const t = cur(); if (!t || t.src !== 'podcast') return;
  const m = lsGet('vdb-pos', {}); const d = au.duration || t.duration || 0;
  if (d && au.currentTime > d - 30) delete m[t.id]; else m[t.id] = Math.floor(au.currentTime);
  lsSet('vdb-pos', m);
}

/* ---------- eventos do elemento de áudio ---------- */
let lastPosSave = 0;
au.addEventListener('play', () => emit('state'));
au.addEventListener('pause', () => { savePos(); emit('state'); });
au.addEventListener('waiting', () => emit('state'));
au.addEventListener('playing', () => emit('state'));
au.addEventListener('timeupdate', () => {
  emit('time');
  if (Date.now() - lastPosSave > 10000) { lastPosSave = Date.now(); savePos(); }
  if ('mediaSession' in navigator && isFinite(au.duration) && au.duration > 0 && !cur()?.live) {
    try { navigator.mediaSession.setPositionState({ duration: au.duration, position: Math.min(au.currentTime, au.duration), playbackRate: 1 }); } catch (e) { }
  }
});
au.addEventListener('ended', () => { if (au.src === SILENT) return; if (Q.repeat === 'one') { au.currentTime = 0; au.play().catch(() => { }); } else next(true); });
au.addEventListener('loadedmetadata', () => { const t = cur(); if (t && au.src !== SILENT) emit('duration', { t, d: au.duration }); });
au.addEventListener('error', () => { if (!au.src || au.src === SILENT || !cur()) return; emit('error', new Error(cur()?.live ? 'Esta rádio está fora do ar agora.' : 'Este áudio não pôde ser tocado neste aparelho.')); });

/* ---------- tela bloqueada ---------- */
export let coverFor = () => '';
export function setCoverFor(fn) { coverFor = fn; }
function updateSession(t) {
  if (!('mediaSession' in navigator) || !t) return;
  try {
    const u = coverFor(t);
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: t.album || '', artwork: u ? [{ src: u, sizes: '512x512' }] : [] });
    const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { } };
    h('seekto', t.live ? null : d => { if (d.seekTime != null) au.currentTime = d.seekTime; });
    h('seekbackward', t.src === 'podcast' ? () => { au.currentTime = Math.max(0, au.currentTime - 15); } : null);
    h('seekforward', t.src === 'podcast' ? () => { au.currentTime += 30; } : null);
  } catch (e) { }
}
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { } };
  h('play', () => toggle()); h('pause', () => au.pause());
  h('previoustrack', () => prev()); h('nexttrack', () => next(false));
}
export function refreshSession() { updateSession(cur()); }
