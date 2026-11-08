// Pequenos utilitários compartilhados por todo o app.
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = t => { if (!isFinite(t) || t < 0) t = 0; const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
export const fmtLong = t => { const m = Math.round(t / 60); if (m < 60) return m + ' min'; return Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
export const fmtMB = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const isHttps = u => typeof u === 'string' && u.startsWith('https://');

const sv = (d, f) => `<svg viewBox="0 0 24 24" aria-hidden="true"${f ? ' class="fill"' : ''}>${d}</svg>`;
export const I = {
  play: sv('<path d="M7 4.6v14.8L19.6 12z"/>', 1),
  pause: sv('<rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>', 1),
  next: sv('<path d="M5 5.2v13.6L15.2 12z"/><rect x="16.4" y="5" width="2.6" height="14" rx="1"/>', 1),
  prev: sv('<path d="M19 5.2v13.6L8.8 12z"/><rect x="5" y="5" width="2.6" height="14" rx="1"/>', 1),
  shuffle: sv('<path d="M3 7h3.2c2 0 3.2 1 4.2 2.7l2.6 4.9c.9 1.6 2.1 2.4 4 2.4H21M3 17h3.2c1.3 0 2.3-.4 3.1-1.3M14.2 8.4c.8-.9 1.8-1.4 3.2-1.4H21M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  repeat: sv('<path d="M4 11V9.5A3.5 3.5 0 017.5 6H20M17 3l3 3-3 3M20 13v1.5a3.5 3.5 0 01-3.5 3.5H4M7 21l-3-3 3-3"/>'),
  heart: sv('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.2a4.3 4.3 0 017.5 2.6C19.5 15.4 12 20 12 20z"/>'),
  heartF: sv('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.2a4.3 4.3 0 017.5 2.6C19.5 15.4 12 20 12 20z"/>', 1),
  more: sv('<circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/>', 1),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
  back: sv('<path d="M15 5l-7 7 7 7"/>'),
  down: sv('<path d="M5 9l7 7 7-7"/>'),
  right: sv('<path d="M9 5l7 7-7 7"/>'),
  music: sv('<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  lists: sv('<path d="M4 6h16M4 11h16M4 16h8M17 14v6M14 17h6"/>'),
  radio: sv('<rect x="3" y="8" width="18" height="12" rx="2.5"/><path d="M7 8l10-4.5"/><circle cx="15.5" cy="14" r="2.5"/><path d="M6.5 12.5h4M6.5 15.5h4"/>'),
  compass: sv('<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  mic: sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 01-2 1.2L14.8 21h-4l-.3-2.4a7.6 7.6 0 01-2-1.2l-1.9.7-2-3.4 1.6-1.2a7.7 7.7 0 010-2.6L4.6 9.7l2-3.4 1.9.7a7.6 7.6 0 012-1.2L10.8 3h4l.3 2.4a7.6 7.6 0 012 1.2l1.9-.7 2 3.4-1.6 1.2a7.7 7.7 0 010 2.6z"/>'),
  playnext: sv('<path d="M4 6h11M4 11h11M4 16h6M15 14.5v5l4.5-2.5z"/>'),
  queue: sv('<path d="M4 6h16M4 11h16M4 16h9M17 14v6M14 17h6"/>'),
  addpl: sv('<path d="M4 6h12M4 11h12M4 16h7M18 13v8M14 17h8"/>'),
  trash: sv('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  edit: sv('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/>'),
  minus: sv('<path d="M5 12h14"/>'),
  cloud: sv('<path d="M7 18.5h10.5a4 4 0 00.6-8 6 6 0 00-11.5 1.6A3.3 3.3 0 007 18.5z"/>'),
  phone: sv('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  dl: sv('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  dlF: sv('<circle cx="12" cy="12" r="9.5" class="fill"/><path d="M12 7v8M8.5 11.5l3.5 3.5 3.5-3.5" style="stroke:var(--bg)"/>'),
  sync: sv('<path d="M20 11a8 8 0 00-14.3-4.6L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0014.3 4.6L20 15.5M20 20v-4.5h-4.5"/>'),
  folder: sv('<path d="M3.5 7.5A2 2 0 015.5 5.5h4l2 2.2h7a2 2 0 012 2V17a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>'),
  live: sv('<circle cx="12" cy="12" r="2.5" class="fill"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M5 5a10 10 0 000 14M19 5a10 10 0 010 14"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  ext: sv('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
};

export function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function artBg(k) { const h = hash(k), a = h % 360, b = (a + 35 + (h >> 9) % 90) % 360; return `linear-gradient(140deg,hsl(${a} 64% 54%),hsl(${b} 56% 30%))`; }

let toastT;
export function toast(msg, ms = 2400) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT);
  if (ms) toastT = setTimeout(() => el.hidden = true, ms);
}

// JSONP: usado para a API de busca da Apple (podcasts), que não envia cabeçalhos CORS de forma confiável.
let jsonpN = 0;
export function jsonp(url, timeout = 12000) {
  return new Promise((res, rej) => {
    const cb = '__vdb_cb' + (++jsonpN), s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { done(); rej(new Error('timeout')); }, timeout);
    window[cb] = data => { done(); res(data); };
    s.onerror = () => { done(); rej(new Error('network')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
  });
}

export async function getJSON(url, opts = {}, timeout = 15000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}

const PREF_KEY = 'vdb-prefs-v2';
export function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } }
export function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { } }
export function lsGet(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
