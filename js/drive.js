// Google Drive: login (OAuth 2.0, fluxo de redirecionamento), listagem de pastas e download de áudio.
import { lsGet, lsSet, getJSON } from './util.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_KEY = 'vdb-gtoken';
const API = 'https://www.googleapis.com/drive/v3';

export class NeedAuth extends Error { constructor() { super('Entre no Google para tocar músicas do Drive.'); this.needAuth = true; } }

export const redirectUri = () => location.origin + location.pathname;

export function token() {
  const t = lsGet(TOKEN_KEY);
  return t && t.exp > Date.now() + 60000 ? t.token : null;
}
export const tokenExpiresIn = () => { const t = lsGet(TOKEN_KEY); return t ? t.exp - Date.now() : 0; };
export const everConnected = () => !!lsGet('vdb-gconnected', false);

export function signIn(clientId, returnState) {
  const state = Math.random().toString(36).slice(2);
  lsSet('vdb-oauth-state', { state, ret: returnState || null });
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE,
    include_granted_scopes: 'true', state, prompt: everConnected() ? '' : 'consent',
  });
  if (!p.get('prompt')) p.delete('prompt');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}

// Chamado ao abrir o app: se voltamos do Google com um token no endereço, guarda-o.
export function handleRedirect() {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const saved = lsGet('vdb-oauth-state');
  history.replaceState(null, '', location.pathname + location.search);
  lsSet('vdb-oauth-state', null);
  if (p.get('error')) return { error: p.get('error') === 'access_denied' ? 'Você não autorizou o acesso ao Drive.' : 'O Google recusou o login: ' + p.get('error'), ret: saved?.ret };
  if (!saved || saved.state !== p.get('state')) return { error: 'Login não confirmado. Tente entrar de novo.' };
  lsSet(TOKEN_KEY, { token: p.get('access_token'), exp: Date.now() + (+p.get('expires_in') || 3600) * 1000 });
  lsSet('vdb-gconnected', true);
  return { ok: true, ret: saved.ret };
}

export function signOut() {
  const t = lsGet(TOKEN_KEY);
  if (t?.token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.token), { method: 'POST' }).catch(() => { });
  lsSet(TOKEN_KEY, null); lsSet('vdb-gconnected', null);
}

async function api(path, params = {}) {
  const tk = token(); if (!tk) throw new NeedAuth();
  const q = new URLSearchParams({ supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...params });
  try { return await getJSON(`${API}/${path}?${q}`, { headers: { Authorization: 'Bearer ' + tk } }); }
  catch (e) { if (e.status === 401) { lsSet(TOKEN_KEY, null); throw new NeedAuth(); } throw e; }
}

export async function listFolders(parent = 'root') {
  const out = []; let pageToken;
  do {
    const r = await api('files', {
      q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken,files(id,name)', orderBy: 'name', pageSize: '200', ...(pageToken ? { pageToken } : {}),
    });
    out.push(...r.files); pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

// Lista os arquivos de áudio de uma pasta (e subpastas, se pedido).
export async function scanFolder(folderId, recursive, onProgress) {
  const files = [], queue = [{ id: folderId, path: '' }], seen = new Set();
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f.id)) continue; seen.add(f.id);
    let pageToken;
    do {
      const r = await api('files', {
        q: `'${f.id}' in parents and trashed=false and (mimeType contains 'audio/' or mimeType='application/octet-stream' or mimeType='video/mp4' or mimeType='application/vnd.google-apps.folder')`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum)', pageSize: '1000', ...(pageToken ? { pageToken } : {}),
      });
      for (const x of r.files) {
        if (x.mimeType === 'application/vnd.google-apps.folder') { if (recursive) queue.push({ id: x.id, path: f.path ? f.path + ' / ' + x.name : x.name }); }
        else files.push({ ...x, folder: f.path });
      }
      pageToken = r.nextPageToken;
      onProgress?.(files.length);
    } while (pageToken);
  }
  return files;
}

async function media(fileId, range, signal) {
  const tk = token(); if (!tk) throw new NeedAuth();
  const headers = { Authorization: 'Bearer ' + tk }; if (range) headers.Range = range;
  const r = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers, signal });
  if (r.status === 401) { lsSet(TOKEN_KEY, null); throw new NeedAuth(); }
  if (!r.ok && r.status !== 206) { const e = new Error('Drive respondeu ' + r.status); e.status = r.status; throw e; }
  return r;
}

export async function download(fileId, mime, signal) {
  const r = await media(fileId, null, signal);
  const b = await r.blob();
  return b.type && b.type !== 'application/octet-stream' ? b : new Blob([b], { type: mime || 'audio/mpeg' });
}

// Baixa só o começo do arquivo, o suficiente para ler as etiquetas ID3.
export async function head(fileId, bytes) {
  const r = await media(fileId, `bytes=0-${bytes - 1}`);
  return new Uint8Array(await r.arrayBuffer());
}
