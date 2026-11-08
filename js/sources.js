// Fontes gratuitas de streaming: rádios (radio-browser.info), Jamendo e podcasts (busca da Apple).
import { getJSON, jsonp, isHttps } from './util.js';

/* ---------- Rádios ---------- */
const RB_HOSTS = ['de1', 'nl1', 'at1', 'de2', 'fi1'].map(h => `https://${h}.api.radio-browser.info`);
let rbHost = RB_HOSTS[Math.floor(Math.random() * RB_HOSTS.length)];

async function rb(path, params) {
  const q = new URLSearchParams(params).toString();
  const tries = [rbHost, ...RB_HOSTS.filter(h => h !== rbHost)];
  let last;
  for (const h of tries) {
    try { const r = await getJSON(`${h}/json/${path}?${q}`, {}, 10000); rbHost = h; return r; }
    catch (e) { last = e; }
  }
  throw last;
}

export function toStation(s) {
  return {
    id: 'r:' + s.stationuuid, src: 'radio', uuid: s.stationuuid, title: s.name.trim(), url: s.url_resolved,
    artist: [s.state, s.country].filter(Boolean).join(' · ') || 'Rádio',
    tags: (s.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 3),
    coverUrl: isHttps(s.favicon) ? s.favicon : '', codec: s.codec, bitrate: s.bitrate, live: true,
  };
}

// Só rádios com transmissão em HTTPS funcionam numa página segura.
export async function searchStations({ name = '', tag = '', country = 'BR', limit = 60 }) {
  const p = { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: String(limit * 2), is_https: 'true' };
  if (name) p.name = name;
  if (tag) p.tag = tag;
  if (country) p.countrycode = country;
  const list = await rb('stations/search', p);
  const seen = new Set();
  return list.filter(s => isHttps(s.url_resolved) && !seen.has(s.name.trim().toLowerCase()) && seen.add(s.name.trim().toLowerCase()))
    .slice(0, limit).map(toStation);
}
export function countClick(uuid) { rb('url/' + uuid, {}).catch(() => { }); }

/* ---------- Jamendo ---------- */
export function toJamendo(t) {
  return {
    id: 'j:' + t.id, src: 'jamendo', jid: t.id, title: t.name, artist: t.artist_name, album: t.album_name || '',
    duration: +t.duration || 0, coverUrl: isHttps(t.image) ? t.image : (isHttps(t.album_image) ? t.album_image : ''),
    url: t.audio, shareurl: t.shareurl, license: t.license_ccurl || '',
  };
}
export async function jamendo(clientId, { search = '', tag = '', order = 'popularity_month', limit = 40 }) {
  const p = new URLSearchParams({ client_id: clientId, format: 'json', limit: String(limit), imagesize: '300', audioformat: 'mp32', order, include: 'musicinfo' });
  if (search) p.set('search', search);
  if (tag) p.set('fuzzytags', tag);
  const r = await getJSON('https://api.jamendo.com/v3.0/tracks/?' + p);
  if (r.headers?.status !== 'success') {
    const msg = r.headers?.error_message || 'erro desconhecido';
    throw new Error(/client/i.test(msg) ? 'O Client ID do Jamendo não foi aceito. Confira nas Configurações.' : 'Jamendo: ' + msg);
  }
  return r.results.filter(t => isHttps(t.audio)).map(toJamendo);
}

/* ---------- Podcasts ---------- */
export async function searchPodcasts(term) {
  const r = await jsonp('https://itunes.apple.com/search?' + new URLSearchParams({ term, media: 'podcast', entity: 'podcast', country: 'BR', limit: '30' }));
  return (r.results || []).map(p => ({
    id: 'p:' + p.collectionId, cid: p.collectionId, title: p.collectionName, artist: p.artistName,
    coverUrl: p.artworkUrl600 || p.artworkUrl100 || '', genre: p.primaryGenreName || '', count: p.trackCount || 0,
  }));
}
export async function episodes(pod) {
  const r = await jsonp('https://itunes.apple.com/lookup?' + new URLSearchParams({ id: pod.cid, entity: 'podcastEpisode', country: 'BR', limit: '100' }));
  return (r.results || []).filter(e => e.wrapperType === 'podcastEpisode' && e.episodeUrl).map(e => ({
    id: 'e:' + e.trackId, src: 'podcast', title: e.trackName, artist: pod.title, album: pod.title, podId: pod.id,
    url: e.episodeUrl.replace(/^http:\/\//, 'https://'), duration: (e.trackTimeMillis || 0) / 1000,
    date: e.releaseDate, coverUrl: e.artworkUrl600 || pod.coverUrl, desc: (e.shortDescription || e.description || '').slice(0, 400),
  })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
