// Vinil de Bolso: telas, estado e ações.
import { $, $$, esc, fmt, fmtLong, fmtMB, uid, plural, I, artBg, toast, lsGet, lsSet, loadPrefs, savePrefs } from './util.js';
import * as DB from './db.js';
import { readTags, parseName, probeDuration, id3Size, AUDIO_EXT, formatLabel } from './tags.js';
import * as Drive from './drive.js';
import * as Src from './sources.js';
import * as P from './player.js';
import { CONFIG } from './config.js';

const VERSION = '2.0.0';
const prefs = loadPrefs();
const S = {
  tracks: [], playlists: [], radios: [], podcasts: [],
  tab: prefs.tab || 'songs', plOpen: null, podOpen: null,
  q: '', sort: prefs.sort || 'recent', filter: 'all', lists: {},
  radio: { q: '', tag: '', country: prefs.radioCountry ?? 'BR', results: null, loading: false, error: '' },
  jam: { q: '', tag: '', results: null, loading: false, error: '' },
  pod: { q: '', results: null, loading: false, error: '', eps: {}, epsLoading: false, epsError: '' },
  sync: { running: false, msg: '' }, tagging: false,
};
P.Q.shuffle = !!prefs.shuffle; P.Q.repeat = prefs.repeat || 'off';
const persist = () => savePrefs({ tab: S.tab === 'settings' ? 'songs' : S.tab, sort: S.sort, shuffle: P.Q.shuffle, repeat: P.Q.repeat, radioCountry: S.radio.country });

const cfg = () => ({ ...CONFIG, ...lsGet('vdb-cfg', {}) });
const setCfg = patch => lsSet('vdb-cfg', { ...lsGet('vdb-cfg', {}), ...patch });

/* ---------- índice de itens ---------- */
let index = new Map();
function reindex() {
  index = new Map();
  for (const t of S.tracks) index.set(t.id, t);
  for (const r of S.radios) index.set(r.id, r);
}
P.setLookup(id => index.get(id));
function findInLists(id) {
  for (const k in S.lists) { const l = S.lists[k]; if (Array.isArray(l)) { const t = l.find(x => x && x.id === id); if (t) return t; } }
  return null;
}
const byId = id => P.byId(id) || findInLists(id);
const inLib = id => S.tracks.some(t => t.id === id);

/* ---------- capas ---------- */
const covers = new Map();
function coverURL(t) {
  if (!t) return '';
  if (t.cover instanceof Blob) { if (!covers.has(t.id)) covers.set(t.id, URL.createObjectURL(t.cover)); return covers.get(t.id); }
  return t.coverUrl || '';
}
P.setCoverFor(coverURL);
function thumb(t, cls = 'thumb') {
  const u = coverURL(t), k = t.album || t.artist || t.title, ch = (String(t.title || '').trim()[0] || '♪').toUpperCase();
  return `<span class="${cls} gen" style="background:${artBg(k)}"><span>${esc(ch)}</span>${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i class="shade"></i></span>`;
}

/* ---------- linhas ---------- */
function rowHTML(t, ctx, i) {
  const c = P.curId() === t.id, off = P.isOffline(t.id) && t.src === 'drive';
  const pos = t.src === 'podcast' ? (lsGet('vdb-pos', {})[t.id] || 0) : 0;
  let sub;
  if (t.src === 'radio') sub = esc([t.tags?.join(', '), t.bitrate ? t.bitrate + ' kbps' : ''].filter(Boolean).join(' · ') || t.artist);
  else if (t.src === 'podcast') sub = esc([t.date ? new Date(t.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '', pos ? 'em andamento' : ''].filter(Boolean).join(' · '));
  else sub = esc(t.artist) + (t.album ? ' · ' + esc(t.album) : '');
  return `<li class="row${c ? ' cur' : ''}${c && !P.au.paused ? ' playing' : ''}" role="button" tabindex="0" data-act="play" data-id="${esc(t.id)}" data-ctx="${ctx}" data-i="${i}">${thumb(t)}
    <span class="meta"><span class="t">${esc(t.title)}</span><span class="a">${t.fav ? `<span class="h">${I.heartF}</span>` : ''}${off ? `<span class="o">${I.dlF}</span>` : ''}<span>${sub}</span></span>
    ${t.src === 'podcast' && pos && t.duration ? `<span class="prog"><i style="width:${Math.min(100, pos / t.duration * 100)}%"></i></span>` : ''}</span>
    ${t.live ? '<span class="live-tag">AO VIVO</span>' : `<span class="dur">${t.duration ? fmt(t.duration) : ''}</span>`}
    <button class="icon-btn" data-act="menu" data-id="${esc(t.id)}" data-ctx="${ctx}" aria-label="Opções de ${esc(t.title)}">${I.more}</button></li>`;
}
function listHTML(items, ctx) { S.lists[ctx] = items; return `<ul class="list">${items.map((t, i) => rowHTML(t, ctx, i)).join('')}</ul>`; }
function markCurrent() {
  $$('.row[data-id]').forEach(r => { const c = r.dataset.id === P.curId(); r.classList.toggle('cur', c); r.classList.toggle('playing', c && !P.au.paused); });
}
const header = (eyebrow, title, sub, right = '') => `<header class="top"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right}</header>`;
const loadingLine = msg => `<div class="loading-line"><span class="spin"></span>${esc(msg)}</div>`;

/* ================= Biblioteca ================= */
const FILTERS = [['all', 'Todas'], ['fav', 'Favoritas'], ['drive', 'Google Drive'], ['local', 'Do aparelho'], ['jamendo', 'Jamendo'], ['offline', 'Offline']];
function sorted(list) {
  const L = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt', { sensitivity: 'base' });
  if (S.sort === 'title') list.sort((a, b) => L(a.title, b.title));
  else if (S.sort === 'artist') list.sort((a, b) => L(a.artist, b.artist) || L(a.album, b.album) || L(a.title, b.title));
  else list.sort((a, b) => (b.added || 0) - (a.added || 0));
  return list;
}
function libFiltered() {
  const q = S.q.trim().toLowerCase();
  return sorted(S.tracks.filter(t => {
    if (S.filter === 'fav' && !t.fav) return false;
    if (['drive', 'local', 'jamendo'].includes(S.filter) && t.src !== S.filter) return false;
    if (S.filter === 'offline' && !P.isOffline(t.id)) return false;
    return !q || (t.title + ' ' + t.artist + ' ' + (t.album || '') + ' ' + (t.folder || '')).toLowerCase().includes(q);
  }));
}
function songListHTML() {
  const list = libFiltered();
  if (!list.length) return `<p class="empty-line">${S.q ? `Nada encontrado para “${esc(S.q)}”.` : 'Nenhuma música neste filtro.'}</p>`;
  return listHTML(list, 'songs');
}
function driveBanner() {
  const c = cfg(), hasDrive = S.tracks.some(t => t.src === 'drive');
  if (S.sync.running) return `<div class="banner"><span class="spin"></span><p>${esc(S.sync.msg || 'Sincronizando com o Google Drive…')}</p></div>`;
  if (hasDrive && c.googleClientId && !Drive.token()) return `<div class="banner"><p>A sessão do Google expira a cada hora. Músicas já baixadas continuam tocando; para as outras, entre de novo.</p><button class="btn primary small" data-act="signin">Entrar com Google</button></div>`;
  return '';
}
function viewSongs() {
  const n = S.tracks.length, total = S.tracks.reduce((a, t) => a + (t.duration || 0), 0);
  let h = header('Biblioteca', 'Músicas', n ? `${plural(n, 'faixa', 'faixas')}${total ? ' · ' + fmtLong(total) : ''}` : 'Google Drive, aparelho e Jamendo num só lugar',
    `<button class="icon-btn" data-act="tab" data-tab="settings" aria-label="Configurações">${I.gear}</button>`);
  h += driveBanner();
  if (!n) {
    const c = cfg();
    h += `<section class="card"><h2>Comece por aqui</h2><ol>
      <li><b>Google Drive:</b> ${c.googleClientId ? 'toque em <b>Conectar Google Drive</b> e escolha a pasta com suas músicas.' : 'abra as <b>Configurações</b> e cole o Client ID do Google (o guia explica como gerar).'}</li>
      <li><b>Do aparelho:</b> importe arquivos MP3/M4A guardados no iPhone.</li>
      <li><b>Explore:</b> rádios, músicas livres no Descobrir e podcasts funcionam sem configurar nada (o Descobrir pede uma chave grátis do Jamendo).</li></ol>
      <div class="toolbar">${c.googleClientId ? `<button class="btn primary" data-act="${Drive.token() ? 'pickfolder' : 'signin'}">${I.cloud}Conectar Google Drive</button>` : `<button class="btn primary" data-act="tab" data-tab="settings">${I.gear}Configurações</button>`}
      <label class="btn" for="file" tabindex="0">${I.phone}Importar do aparelho</label></div></section>`;
    return h;
  }
  h += `<div class="toolbar"><button class="btn primary" data-act="playall" data-ctx="songs">${I.play}Tocar</button><button class="btn" data-act="shuffleall" data-ctx="songs">${I.shuffle}Aleatório</button><label class="btn" for="file" tabindex="0">${I.plus}Importar</label>${cfg().folder ? `<button class="btn" data-act="sync" aria-label="Sincronizar Drive"${S.sync.running ? ' disabled' : ''}>${I.sync}Drive</button>` : ''}</div>
  <div class="chips" role="group" aria-label="Filtrar">${FILTERS.map(([k, l]) => `<button class="chip-btn" data-act="filter" data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>
  <div class="filters"><label class="search">${I.search}<input id="q" type="search" placeholder="Buscar título, artista, álbum ou pasta" value="${esc(S.q)}" autocomplete="off" aria-label="Buscar"></label>
  <select id="sort" aria-label="Ordenar"><option value="recent"${S.sort === 'recent' ? ' selected' : ''}>Recentes</option><option value="title"${S.sort === 'title' ? ' selected' : ''}>Título</option><option value="artist"${S.sort === 'artist' ? ' selected' : ''}>Artista</option></select></div>
  <div id="songlist">${songListHTML()}</div>`;
  return h;
}

/* ================= Playlists ================= */
function mosaic(pl) {
  const ts = pl.trackIds.map(byId).filter(Boolean), art = ts.filter(t => coverURL(t)), pick = (art.length >= 4 ? art : ts).slice(0, 4);
  if (pick.length < 4) return `<div class="cov one">${pick[0] ? thumb(pick[0]) : thumb({ title: pl.name, album: pl.name })}</div>`;
  return `<div class="cov">${pick.map(t => thumb(t)).join('')}</div>`;
}
function viewPlaylists() {
  if (S.plOpen) { const pl = S.playlists.find(p => p.id === S.plOpen); if (pl) return viewPlaylist(pl); S.plOpen = null; }
  let h = header('Coleções', 'Playlists', S.playlists.length ? plural(S.playlists.length, 'playlist', 'playlists') : 'Monte seleções para cada momento');
  h += `<div class="toolbar"><button class="btn primary" data-act="newpl">${I.plus}Nova playlist</button></div>`;
  if (!S.playlists.length) return h + `<p class="empty-line">Nenhuma playlist ainda. Crie uma e use o botão ⋯ ao lado de qualquer música para adicioná-la.</p>`;
  return h + `<ul class="grid">${S.playlists.slice().sort((a, b) => b.created - a.created).map(p => `<li class="tile" role="button" tabindex="0" data-act="openpl" data-id="${p.id}">${mosaic(p)}<span class="t">${esc(p.name)}</span><span class="a">${plural(p.trackIds.filter(byId).length, 'faixa', 'faixas')}</span></li>`).join('')}</ul>`;
}
function viewPlaylist(pl) {
  const ts = pl.trackIds.map(byId).filter(Boolean), total = ts.reduce((a, t) => a + (t.duration || 0), 0);
  const drive = ts.filter(t => t.src === 'drive'), off = drive.filter(t => P.isOffline(t.id)).length;
  let h = `<button class="back" data-act="backpl">${I.back}Playlists</button>` + header('Playlist', esc(pl.name), `${plural(ts.length, 'faixa', 'faixas')}${total ? ' · ' + fmtLong(total) : ''}${drive.length ? ` · ${off} de ${drive.length} do Drive offline` : ''}`);
  h += `<div class="toolbar">${ts.length ? `<button class="btn primary" data-act="playall" data-ctx="pl">${I.play}Tocar</button><button class="btn" data-act="shuffleall" data-ctx="pl">${I.shuffle}Aleatório</button>` : ''}${drive.length && off < drive.length ? `<button class="btn" data-act="dlpl" data-id="${pl.id}">${I.dl}Baixar</button>` : ''}<button class="btn" data-act="plmenu" data-id="${pl.id}" aria-label="Opções da playlist">${I.more}</button></div>`;
  return h + (ts.length ? listHTML(ts, 'pl') : `<p class="empty-line">Playlist vazia. Na aba Músicas ou no Descobrir, toque em ⋯ ao lado de uma faixa e escolha “Adicionar à playlist”.</p>`);
}

/* ================= Rádios ================= */
const RADIO_TAGS = [['', 'Populares'], ['sertanejo', 'Sertanejo'], ['pagode', 'Pagode'], ['mpb', 'MPB'], ['rock', 'Rock'], ['pop', 'Pop'], ['funk', 'Funk'], ['gospel', 'Gospel'], ['news', 'Notícias'], ['electronic', 'Eletrônica'], ['jazz', 'Jazz'], ['classical', 'Clássica'], ['lofi', 'Lo-fi'], ['80s', 'Anos 80']];
function viewRadio() {
  const R = S.radio;
  let h = header('Ao vivo', 'Rádios', R.country ? 'Estações do Brasil' : 'Estações do mundo todo');
  h += `<form class="filters" id="radioForm"><label class="search">${I.search}<input id="rq" type="search" placeholder="Nome da rádio ou cidade" value="${esc(R.q)}" autocomplete="off" aria-label="Buscar rádio"></label>
    <select id="rcountry" aria-label="Região"><option value="BR"${R.country === 'BR' ? ' selected' : ''}>Brasil</option><option value=""${!R.country ? ' selected' : ''}>Mundo</option></select></form>
  <div class="chips" role="group" aria-label="Gênero">${RADIO_TAGS.map(([k, l]) => `<button class="chip-btn" data-act="rtag" data-tag="${k}" aria-pressed="${R.tag === k && !R.q}">${l}</button>`).join('')}</div>`;
  if (S.radios.length && !R.q) h += `<div class="sec-head"><h2>Suas rádios</h2></div>` + listHTML(S.radios.slice().sort((a, b) => a.title.localeCompare(b.title, 'pt')), 'radiofav');
  h += `<div class="sec-head"><h2>${R.q ? 'Resultados' : (RADIO_TAGS.find(t => t[0] === R.tag)?.[1] || 'Populares')}</h2></div>`;
  if (R.loading) h += loadingLine('Procurando rádios…');
  else if (R.error) h += `<p class="empty-line">${esc(R.error)} <button class="btn small" data-act="rretry">Tentar de novo</button></p>`;
  else if (R.results && !R.results.length) h += `<p class="empty-line">Nenhuma rádio encontrada.</p>`;
  else if (R.results) h += listHTML(R.results, 'radio');
  h += `<p class="foot">Lista de rádios: radio-browser.info</p>`;
  if (!R.results && !R.loading && !R.error) setTimeout(loadRadio, 0);
  return h;
}
async function loadRadio() {
  const R = S.radio; R.loading = true; R.error = ''; if (S.tab === 'radio') render();
  try { R.results = await Src.searchStations({ name: R.q.trim(), tag: R.q ? '' : R.tag, country: R.country }); }
  catch (e) { R.error = 'Não foi possível carregar as rádios. Confira sua internet.'; R.results = null; }
  R.loading = false; if (S.tab === 'radio') render();
}

/* ================= Descobrir (Jamendo) ================= */
const JAM_TAGS = [['', 'Em alta'], ['pop', 'Pop'], ['rock', 'Rock'], ['electronic', 'Eletrônica'], ['hiphop', 'Hip-hop'], ['jazz', 'Jazz'], ['lounge', 'Lounge'], ['acoustic', 'Acústica'], ['chillout', 'Chillout'], ['ambient', 'Ambiente'], ['classical', 'Clássica'], ['latin', 'Latina'], ['reggae', 'Reggae'], ['metal', 'Metal'], ['soundtrack', 'Trilha sonora']];
function viewDiscover() {
  const J = S.jam, id = cfg().jamendoClientId;
  let h = header('Músicas livres', 'Descobrir', 'Artistas independentes do Jamendo, de graça e liberadas');
  if (!id) return h + `<section class="card"><h2>Falta só uma chave grátis</h2><ol>
    <li>Crie uma conta em <a href="https://devportal.jamendo.com/" target="_blank" rel="noopener">devportal.jamendo.com</a>.</li>
    <li>Em <b>My Applications</b>, crie um app com qualquer nome (ex.: “Vinil de Bolso”).</li>
    <li>Copie o <b>Client ID</b> e cole aqui:</li></ol>
    <form id="jamForm" style="margin-top:12px;display:grid;gap:10px"><input class="field" id="jamId" placeholder="Client ID do Jamendo" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" type="submit">Salvar</button></form></section>`;
  h += `<form class="filters" id="jamSearch"><label class="search">${I.search}<input id="jq" type="search" placeholder="Artista, música ou estilo" value="${esc(J.q)}" autocomplete="off" aria-label="Buscar no Jamendo"></label></form>
  <div class="chips" role="group" aria-label="Gênero">${JAM_TAGS.map(([k, l]) => `<button class="chip-btn" data-act="jtag" data-tag="${k}" aria-pressed="${J.tag === k && !J.q}">${l}</button>`).join('')}</div>`;
  if (J.results?.length && !J.loading) h += `<div class="toolbar"><button class="btn primary" data-act="playall" data-ctx="jam">${I.play}Tocar todas</button><button class="btn" data-act="shuffleall" data-ctx="jam">${I.shuffle}Aleatório</button></div>`;
  if (J.loading) h += loadingLine('Buscando músicas…');
  else if (J.error) h += `<p class="empty-line">${esc(J.error)} <button class="btn small" data-act="jretry">Tentar de novo</button></p>`;
  else if (J.results && !J.results.length) h += `<p class="empty-line">Nada encontrado.</p>`;
  else if (J.results) h += listHTML(J.results.map(t => index.get(t.id) || t), 'jam');
  h += `<p class="foot">Músicas do Jamendo sob licenças Creative Commons. Toque em ⋯ para salvar na biblioteca.</p>`;
  if (!J.results && !J.loading && !J.error) setTimeout(loadJam, 0);
  return h;
}
async function loadJam() {
  const J = S.jam; J.loading = true; J.error = ''; if (S.tab === 'discover') render();
  try { J.results = await Src.jamendo(cfg().jamendoClientId, { search: J.q.trim(), tag: J.q ? '' : J.tag, order: J.q ? 'relevance' : 'popularity_month' }); }
  catch (e) { J.error = e.message?.startsWith('O Client') || e.message?.startsWith('Jamendo') ? e.message : 'Não foi possível falar com o Jamendo. Confira sua internet.'; J.results = null; }
  J.loading = false; if (S.tab === 'discover') render();
}

/* ================= Podcasts ================= */
const POD_SUGGEST = ['Nerdcast', 'Café da Manhã', 'Mano a Mano', 'Xadrez Verbal', 'Naruhodo', 'Flow Podcast', 'Podpah', 'O Assunto'];
function podTile(p) { return `<li class="tile" role="button" tabindex="0" data-act="openpod" data-id="${esc(p.id)}"><div class="cov one">${thumb(p)}</div><span class="t">${esc(p.title)}</span><span class="a">${esc(p.artist)}</span></li>`; }
function viewPodcasts() {
  const D = S.pod;
  if (S.podOpen) return viewPodcast(S.podOpen);
  let h = header('Para ouvir', 'Podcasts', S.podcasts.length ? `Você segue ${plural(S.podcasts.length, 'podcast', 'podcasts')}` : 'Busque e siga seus programas favoritos');
  h += `<form class="filters" id="podSearch"><label class="search">${I.search}<input id="pq" type="search" placeholder="Nome do podcast ou assunto" value="${esc(D.q)}" autocomplete="off" aria-label="Buscar podcast"></label></form>`;
  if (!D.q) h += `<div class="chips" role="group" aria-label="Sugestões">${POD_SUGGEST.map(s => `<button class="chip-btn" data-act="psuggest" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  if (D.q) {
    h += `<div class="sec-head"><h2>Resultados</h2><button class="btn small" data-act="pclear">Limpar</button></div>`;
    if (D.loading) h += loadingLine('Buscando podcasts…');
    else if (D.error) h += `<p class="empty-line">${esc(D.error)}</p>`;
    else if (D.results && !D.results.length) h += `<p class="empty-line">Nenhum podcast encontrado.</p>`;
    else if (D.results) { S.lists.podres = D.results; h += `<ul class="grid">${D.results.map(podTile).join('')}</ul>`; }
  }
  if (S.podcasts.length) h += `<div class="sec-head"><h2>Seguindo</h2></div><ul class="grid">${S.podcasts.map(podTile).join('')}</ul>`;
  else if (!D.q) h += `<p class="empty-line">Busque um podcast ou toque numa sugestão acima.</p>`;
  return h;
}
function viewPodcast(p) {
  const D = S.pod, eps = D.eps[p.id], following = S.podcasts.some(x => x.id === p.id);
  let h = `<button class="back" data-act="backpod">${I.back}Podcasts</button>
    <div class="pod-head">${thumb(p)}<div><span class="eyebrow">${esc(p.genre || 'Podcast')}</span><h1>${esc(p.title)}</h1><p class="sub" style="margin:0">${esc(p.artist)}</p></div></div>
    <div class="toolbar"><button class="btn ${following ? '' : 'primary'}" data-act="follow" data-id="${esc(p.id)}">${following ? I.check + 'Seguindo' : I.plus + 'Seguir'}</button>${eps?.length ? `<button class="btn" data-act="playall" data-ctx="eps">${I.play}Mais recente</button>` : ''}</div>`;
  if (D.epsLoading && !eps) h += loadingLine('Carregando episódios…');
  else if (D.epsError && !eps) h += `<p class="empty-line">${esc(D.epsError)}</p>`;
  else if (eps && !eps.length) h += `<p class="empty-line">Nenhum episódio disponível.</p>`;
  else if (eps) h += listHTML(eps, 'eps');
  return h;
}
async function openPodcast(p) {
  S.podOpen = p; render(); scrollTo(0, 0);
  if (S.pod.eps[p.id]) return;
  S.pod.epsLoading = true; S.pod.epsError = '';
  try { S.pod.eps[p.id] = await Src.episodes(p); }
  catch (e) { S.pod.epsError = 'Não foi possível carregar os episódios. Confira sua internet.'; }
  S.pod.epsLoading = false; if (S.tab === 'podcasts' && S.podOpen?.id === p.id) render();
}

/* ================= Configurações ================= */
function viewSettings() {
  const c = cfg(), tk = Drive.token(), mins = Math.round(Drive.tokenExpiresIn() / 60000);
  const lastSync = lsGet('vdb-lastsync');
  let h = `<button class="back" data-act="tab" data-tab="songs">${I.back}Músicas</button>` + header('Ajustes', 'Configurações', '');
  h += `<section class="set"><h2>${I.cloud}Google Drive</h2>`;
  if (!c.googleClientId) {
    h += `<p>Para ler suas músicas do Drive, o app precisa de um <b>Client ID</b> do Google. Ele é gratuito e o guia no GitHub mostra o passo a passo.</p>
      <p>Na configuração do Google, use este endereço em <b>Origens JavaScript autorizadas</b> e em <b>URIs de redirecionamento autorizados</b>:</p>
      <div class="copybox"><code id="ruri">${esc(Drive.redirectUri())}</code><button class="btn small" data-act="copy" data-target="ruri">Copiar</button></div>
      <form id="gForm" style="display:grid;gap:10px"><input class="field" id="gId" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" type="submit">Salvar Client ID</button></form>`;
  } else {
    h += `<div class="kv"><span>Situação</span>${tk ? `<span class="status ok">Conectado · expira em ${mins} min</span>` : Drive.everConnected() ? `<span class="status warn">Sessão expirada</span>` : '<span class="status">Desconectado</span>'}</div>`;
    h += `<div class="kv"><span>Pasta</span><b>${c.folder ? esc(c.folder.name) : 'nenhuma escolhida'}</b></div>`;
    if (c.folder) h += `<label class="switch">Incluir subpastas<input type="checkbox" id="recursive"${c.folder.recursive ? ' checked' : ''}></label>
      <div class="kv"><span>Última sincronização</span><b>${lastSync ? new Date(lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'}</b></div>`;
    h += `<div class="toolbar" style="margin:0">${tk ? `<button class="btn primary" data-act="pickfolder">${I.folder}${c.folder ? 'Trocar pasta' : 'Escolher pasta'}</button>${c.folder ? `<button class="btn" data-act="sync"${S.sync.running ? ' disabled' : ''}>${I.sync}Sincronizar</button>` : ''}<button class="btn" data-act="signout">Sair</button>`
      : `<button class="btn primary" data-act="signin">Entrar com Google</button>`}</div>
      <p>O Google pede um novo login a cada hora. As músicas que você já ouviu ficam guardadas por um tempo e tocam mesmo sem login.</p>
      <details><summary class="note" style="cursor:pointer">Trocar Client ID</summary><form id="gForm" style="display:grid;gap:10px;margin-top:8px"><input class="field" id="gId" value="${esc(c.googleClientId)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Salvar</button></form>
      <div class="copybox" style="margin-top:10px"><code id="ruri">${esc(Drive.redirectUri())}</code><button class="btn small" data-act="copy" data-target="ruri">Copiar</button></div></details>`;
  }
  h += `</section>`;
  h += `<section class="set"><h2>${I.compass}Jamendo</h2><p>Chave grátis para a aba Descobrir.</p>
    <form id="jamForm" style="display:grid;gap:10px"><input class="field" id="jamId" value="${esc(c.jamendoClientId || '')}" placeholder="Client ID do Jamendo" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Salvar</button></form></section>`;
  const lim = lsGet('vdb-cache-limit', 500);
  h += `<section class="set"><h2>${I.dl}Armazenamento</h2>
    <div class="kv"><span>Baixadas do Drive (offline)</span><b>${fmtMB(P.storedBytes('offline'))}</b></div>
    <div class="kv"><span>Importadas do aparelho</span><b>${fmtMB(P.storedBytes('local'))}</b></div>
    <div class="kv"><span>Guardadas temporariamente</span><b>${fmtMB(P.storedBytes('cache'))}</b></div>
    <div class="kv"><span>Limite do temporário</span><select id="cachelim" aria-label="Limite do armazenamento temporário">${[250, 500, 1000, 2000, 4000].map(v => `<option value="${v}"${v === lim ? ' selected' : ''}>${v >= 1000 ? v / 1000 + ' GB' : v + ' MB'}</option>`).join('')}</select></div>
    <p id="quota"></p>
    <div class="toolbar" style="margin:0"><button class="btn" data-act="clearcache">Limpar temporário</button></div></section>`;
  h += `<section class="set"><h2>${I.music}Sobre</h2><p>Vinil de Bolso ${VERSION}. Seus dados ficam só neste aparelho. O app lê o Drive apenas com permissão de leitura.</p></section>`;
  setTimeout(async () => { try { const e = await navigator.storage.estimate(); const q = $('#quota'); if (q) q.textContent = `Espaço disponível para o app neste aparelho: ${(e.quota / 1073741824).toFixed(1).replace('.', ',')} GB.`; } catch (e) { } }, 0);
  return h;
}

/* ================= render ================= */
const TABS = [['songs', I.music, 'Músicas'], ['playlists', I.lists, 'Playlists'], ['radio', I.radio, 'Rádios'], ['discover', I.compass, 'Descobrir'], ['podcasts', I.mic, 'Podcasts']];
function render() {
  const m = $('#main');
  m.innerHTML = { songs: viewSongs, playlists: viewPlaylists, radio: viewRadio, discover: viewDiscover, podcasts: viewPodcasts, settings: viewSettings }[S.tab]?.() ?? viewSongs();
  for (const [k] of TABS) { const b = $('#tab-' + k); if (k === S.tab || (S.tab === 'settings' && k === 'songs')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
}
let songTimer;
function refreshSongList() { clearTimeout(songTimer); songTimer = setTimeout(() => { const l = $('#songlist'); if (l && S.tab === 'songs') l.innerHTML = songListHTML(); }, 250); }

/* ---------- dock e player ---------- */
function setStatic() {
  for (const [k, ic, l] of TABS) $('#tab-' + k).innerHTML = ic + l;
  $('#miniNext').innerHTML = I.next; $('#plClose').innerHTML = I.down; $('#plMore').innerHTML = I.more;
  $('#cPrev').innerHTML = I.prev; $('#cNext').innerHTML = I.next;
}
const SRC_LABEL = { drive: 'Do Google Drive', local: 'Do aparelho', jamendo: 'Do Jamendo', radio: 'Rádio ao vivo', podcast: 'Podcast' };
function updatePlayIcons() {
  const playing = !P.au.paused, busy = P.Q.loading;
  const ic = busy ? '<span class="spin"></span>' : playing ? I.pause : I.play, lab = playing ? 'Pausar' : 'Tocar';
  for (const id of ['#miniPlay', '#cPlay']) { const b = $(id); b.innerHTML = ic; b.setAttribute('aria-label', lab); }
  markCurrent();
}
function updateDock() {
  const t = P.cur(); $('#mini').hidden = !t; if (!t) return;
  $('#miniArt').innerHTML = thumb(t); $('#miniTitle').textContent = t.title; $('#miniArtist').textContent = t.artist || '';
  updatePlayIcons();
}
function renderPlayer() {
  const t = P.cur(); if (!t) { $('#player').hidden = true; return; }
  if ($('#player').hidden) return;
  const u = coverURL(t), k = t.album || t.artist || t.title, art = $('#plArt');
  art.className = 'art gen'; art.style.background = artBg(k);
  art.innerHTML = `<span>${esc((String(t.title).trim()[0] || '♪').toUpperCase())}</span>${u ? `<img src="${esc(u)}" alt="" onerror="this.remove()">` : ''}${P.Q.loading ? '<span class="spin"></span>' : ''}`;
  $('#plGlow').style.background = artBg(k);
  $('#plSource').textContent = SRC_LABEL[t.src] || 'Tocando agora';
  $('#plTitle').textContent = t.title; $('#plArtist').textContent = (t.artist || '') + (t.album && t.album !== t.artist ? ' · ' + t.album : '');
  const canFav = inLib(t.id) || t.src === 'jamendo' || t.src === 'radio';
  const fav = t.src === 'radio' ? S.radios.some(r => r.id === t.id) : !!index.get(t.id)?.fav;
  const f = $('#plFav'); f.hidden = !canFav; f.classList.toggle('on', fav); f.innerHTML = fav ? I.heartF : I.heart; f.setAttribute('aria-label', fav ? 'Desfavoritar' : 'Favoritar');
  const live = !!t.live, pod = t.src === 'podcast';
  $('#seek').hidden = live; $('#tCur').style.visibility = live ? 'hidden' : ''; $('#tDur').style.visibility = live ? 'hidden' : '';
  const fc = $('#tFmt'); fc.classList.toggle('live', live);
  fc.textContent = live ? 'AO VIVO' + (t.bitrate ? ` · ${t.bitrate} KBPS` : '') : t.src === 'drive' || t.src === 'local' ? formatLabel(t.mime, t.name) + (t.size ? ' · ' + fmtMB(t.size) : '') + (P.isOffline(t.id) || t.src === 'local' ? ' · OFFLINE' : '') : t.src === 'jamendo' ? 'MP3 · CC' : 'EPISÓDIO';
  const sh = $('#cShuffle'), rp = $('#cRepeat');
  if (pod) {
    sh.className = 'icon-btn skip'; sh.dataset.act = 'back15'; sh.innerHTML = '−15'; sh.setAttribute('aria-label', 'Voltar 15 segundos');
    rp.className = 'icon-btn skip'; rp.dataset.act = 'fwd30'; rp.innerHTML = '+30'; rp.setAttribute('aria-label', 'Avançar 30 segundos');
  } else {
    sh.className = 'icon-btn toggle' + (P.Q.shuffle ? ' on' : ''); sh.dataset.act = 'shuffle'; sh.innerHTML = I.shuffle; sh.setAttribute('aria-label', 'Aleatório'); sh.setAttribute('aria-pressed', P.Q.shuffle);
    rp.className = 'icon-btn toggle' + (P.Q.repeat !== 'off' ? ' on' : ''); rp.dataset.act = 'repeat'; rp.innerHTML = I.repeat + (P.Q.repeat === 'one' ? '<span class="badge">1</span>' : '');
    rp.setAttribute('aria-label', P.Q.repeat === 'one' ? 'Repetir: esta' : P.Q.repeat === 'all' ? 'Repetir: tudo' : 'Repetir: desligado');
  }
  $('#upnextTitle').textContent = live ? 'Outras rádios' : 'A seguir';
  const nxt = P.Q.queue.slice(P.Q.idx + 1, P.Q.idx + 41);
  $('#upnext').innerHTML = nxt.length ? nxt.map((id, k) => { const x = byId(id); return x ? `<li class="row" role="button" tabindex="0" data-act="jumpq" data-i="${P.Q.idx + 1 + k}">${thumb(x)}<span class="meta"><span class="t">${esc(x.title)}</span><span class="a"><span>${esc(x.artist || '')}</span></span></span>${x.live ? '' : `<span class="dur">${x.duration ? fmt(x.duration) : ''}</span>`}</li>` : ''; }).join('')
    : `<li class="empty-line">${P.Q.repeat === 'all' ? 'A fila recomeça do início.' : 'Fim da fila.'}</li>`;
  updatePlayIcons(); updateTime();
}
let seeking = false;
function updateTime() {
  const t = P.cur(), d = isFinite(P.au.duration) ? P.au.duration : (t?.duration || 0), c = P.au.currentTime || 0;
  $('#miniBar').style.width = (d && !t?.live ? Math.min(100, c / d * 100) : 0) + '%';
  if (seeking || $('#player').hidden) return;
  $('#seek').value = d ? Math.round(c / d * 1000) : 0; $('#tCur').textContent = fmt(c); $('#tDur').textContent = fmt(d);
}
const seek = $('#seek');
seek.addEventListener('input', () => { seeking = true; const d = P.au.duration || 0; $('#tCur').textContent = fmt(seek.value / 1000 * d); });
seek.addEventListener('change', () => { const d = P.au.duration || 0; if (d) P.au.currentTime = seek.value / 1000 * d; seeking = false; updateTime(); });

P.bus.addEventListener('change', () => { updateDock(); renderPlayer(); markCurrent(); });
P.bus.addEventListener('state', updatePlayIcons);
P.bus.addEventListener('time', updateTime);
P.bus.addEventListener('error', e => toast(e.detail?.message || 'Não foi possível tocar.', 3500));
P.bus.addEventListener('blocked', () => toast('Toque em ▶ para começar.'));
P.bus.addEventListener('needauth', () => askSignIn());
P.bus.addEventListener('duration', async e => {
  const { t, d } = e.detail; if (!isFinite(d) || d <= 0 || t.live) return;
  const lib = index.get(t.id);
  if (lib && Math.abs((lib.duration || 0) - d) > 1) { lib.duration = d; DB.put('tracks', lib).catch(() => { }); $$(`.row[data-id="${CSS.escape(t.id)}"] .dur`).forEach(x => x.textContent = fmt(d)); }
});
P.bus.addEventListener('downloaded', e => { const t = index.get(e.detail); if (t && t.src === 'drive' && !t.tagged) tagQueue.unshift(t), runTagging(); });

/* ---------- Google Drive ---------- */
function askSignIn(ret) {
  const c = cfg();
  if (!c.googleClientId) { toast('Configure o Google Drive nas Configurações.'); return; }
  openSheet(`<h3>Entrar no Google</h3><p>O Google pede um novo login a cada hora para tocar as músicas do Drive que ainda não estão guardadas no aparelho. A música atual vai pausar enquanto você entra.</p>
    <div class="row-btns"><button class="btn" data-act="closesheet">Agora não</button><button class="btn primary" data-act="signin" data-ret="${esc(ret || '')}">Entrar com Google</button></div>`);
}
function signIn(ret) {
  const t = P.cur(); if (t && !t.live) lsSet('vdb-resume', { id: t.id, t: Math.floor(P.au.currentTime || 0) });
  lsSet('vdb-return-tab', S.tab);
  Drive.signIn(cfg().googleClientId, ret || (cfg().folder ? 'sync' : 'pickfolder'));
}
const FP = { stack: [], folders: null, loading: false, error: '' };
async function folderPicker(reset) {
  if (reset || !FP.stack.length) FP.stack = [{ id: 'root', name: 'Meu Drive' }];
  FP.loading = true; FP.error = ''; drawPicker();
  try { FP.folders = await Drive.listFolders(FP.stack.at(-1).id); }
  catch (e) { if (e.needAuth) { closeSheet(); askSignIn('pickfolder'); return; } FP.error = 'Não foi possível listar as pastas.'; FP.folders = []; }
  FP.loading = false; drawPicker();
}
function drawPicker() {
  const here = FP.stack.at(-1);
  openSheet(`<h3>Escolha a pasta das músicas</h3>
    <div class="crumbs">${FP.stack.map((f, i) => i < FP.stack.length - 1 ? `<button data-act="fpup" data-i="${i}">${esc(f.name)}</button><span>›</span>` : `<b>${esc(f.name)}</b>`).join('')}</div>
    ${FP.loading ? loadingLine('Abrindo…') : FP.error ? `<p>${esc(FP.error)}</p>` : `<div class="acts">${FP.folders.length ? FP.folders.map(f => `<button class="act" data-act="fpin" data-id="${esc(f.id)}" data-name="${esc(f.name)}">${I.folder}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>${I.right}</button>`).join('') : '<p>Nenhuma subpasta aqui.</p>'}</div>`}
    <label class="switch" style="margin:10px 0 14px">Incluir subpastas<input type="checkbox" id="fpRec" checked></label>
    <div class="row-btns"><button class="btn" data-act="closesheet">Cancelar</button><button class="btn primary" data-act="fpuse">Usar “${esc(here.name)}”</button></div>`, true);
}
async function syncDrive(manual) {
  const c = cfg(); if (!c.folder || S.sync.running) return;
  if (!Drive.token()) { if (manual) askSignIn('sync'); return; }
  S.sync.running = true; S.sync.msg = 'Lendo a pasta do Drive…'; rerenderSoft();
  try {
    const files = await Drive.scanFolder(c.folder.id, c.folder.recursive, n => { S.sync.msg = `Lendo a pasta do Drive… ${n} arquivos`; const b = $('.banner p'); if (b) b.textContent = S.sync.msg; });
    const audio = files.filter(f => f.mimeType.startsWith('audio/') || AUDIO_EXT.test(f.name));
    const ids = new Set(audio.map(f => 'd:' + f.id)), add = [];
    for (const f of audio) {
      const id = 'd:' + f.id, old = index.get(id);
      if (old) {
        if (old.md5 && f.md5Checksum && old.md5 !== f.md5Checksum) { old.md5 = f.md5Checksum; old.tagged = false; old.size = +f.size || 0; P.dropAudio(id).catch(() => { }); add.push(old); }
        if ((old.folder || '') !== (f.folder || '')) { old.folder = f.folder; add.push(old); }
        continue;
      }
      const fn = parseName(f.name), folderName = f.folder ? f.folder.split(' / ').pop() : '';
      const t = { id, src: 'drive', fileId: f.id, title: fn.title || f.name, artist: fn.artist || folderName || 'Artista desconhecido', album: '', duration: 0,
        added: Date.parse(f.modifiedTime) || Date.now(), fav: false, mime: f.mimeType, size: +f.size || 0, name: f.name, folder: f.folder || '', md5: f.md5Checksum || '', tagged: false };
      S.tracks.push(t); add.push(t);
    }
    const gone = S.tracks.filter(t => t.src === 'drive' && !ids.has(t.id));
    await DB.putMany('tracks', add);
    if (gone.length) { await removeTracks(gone.map(t => t.id)); }
    reindex(); lsSet('vdb-lastsync', Date.now());
    toast(`Drive sincronizado: ${plural(audio.length, 'música', 'músicas')}${gone.length ? `, ${gone.length} removidas` : ''}`);
  } catch (e) {
    if (e.needAuth) askSignIn('sync'); else toast('Não foi possível ler o Drive: ' + e.message, 4000);
  } finally {
    S.sync.running = false; rerenderSoft();
    tagQueue = S.tracks.filter(t => t.src === 'drive' && !t.tagged); runTagging();
  }
}
// Lê título, artista, álbum e capa dos arquivos do Drive, baixando só o começo de cada um.
let tagQueue = [];
async function runTagging() {
  if (S.tagging) return; S.tagging = true;
  let changed = 0;
  try {
    while (tagQueue.length && Drive.token()) {
      const t = tagQueue.shift(); if (!t || t.tagged || !index.get(t.id)) continue;
      try {
        let head = await Drive.head(t.fileId, 131072); const need = id3Size(head);
        if (need > head.length) head = await Drive.head(t.fileId, Math.min(need, 3 * 1048576));
        const tags = need ? await readTags(new Blob([head])) : {};
        if (need > head.length) delete tags.cover;
        if (tags.title) t.title = tags.title;
        if (tags.artist) t.artist = tags.artist;
        if (tags.album) t.album = tags.album;
        if (tags.cover) { t.cover = tags.cover; if (covers.has(t.id)) { URL.revokeObjectURL(covers.get(t.id)); covers.delete(t.id); } }
        t.tagged = true; await DB.put('tracks', t); changed++;
        if (changed % 8 === 0) refreshSongList();
      } catch (e) { if (e.needAuth) break; t.tagged = true; DB.put('tracks', t).catch(() => { }); }
    }
  } finally { S.tagging = false; if (changed) { refreshSongList(); if (S.tab === 'playlists') render(); updateDock(); } }
}
async function downloadTracks(list) {
  const todo = list.filter(t => t.src === 'drive' && !P.isOffline(t.id));
  if (!todo.length) { toast('Já está tudo disponível offline.'); return; }
  let n = 0;
  for (const t of todo) {
    toast(`Baixando ${n + 1} de ${todo.length}…`, 0);
    try {
      if (!(await P.setAudioKind(t.id, 'offline'))) { const b = await Drive.download(t.fileId, t.mime); await P.storeAudio(t.id, b, 'offline'); }
      n++;
    } catch (e) { if (e.needAuth) { askSignIn(); break; } toast('Erro ao baixar “' + t.title + '”.', 3000); break; }
  }
  toast(n ? `${plural(n, 'música disponível', 'músicas disponíveis')} offline` : 'Nada foi baixado.');
  rerenderSoft();
}

/* ---------- edições da biblioteca ---------- */
async function importFiles(files) {
  files = [...files].filter(f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
  if (!files.length) { toast('Nenhum arquivo de áudio encontrado.'); return; }
  try { navigator.storage?.persist?.(); } catch (e) { }
  let n = 0; const add = [];
  for (const f of files) {
    toast(`Importando ${n + 1} de ${files.length}…`, 0);
    const blob = new Blob([f], { type: f.type || 'audio/mpeg' }), tags = await readTags(blob), fn = parseName(f.name);
    const t = { id: 'l:' + uid(), src: 'local', title: tags.title || fn.title || f.name, artist: tags.artist || fn.artist || 'Artista desconhecido', album: tags.album || '',
      duration: await probeDuration(blob), added: Date.now() + n, fav: false, cover: tags.cover || null, mime: blob.type, size: blob.size, name: f.name };
    try { await P.storeAudio(t.id, blob, 'local'); await DB.put('tracks', t); }
    catch (e) { toast('Sem espaço para salvar mais músicas neste aparelho.', 4000); break; }
    S.tracks.push(t); add.push(t); n++;
  }
  reindex();
  if (n) { S.tab = 'songs'; S.plOpen = null; persist(); render(); toast(plural(n, 'música adicionada', 'músicas adicionadas')); }
}
async function removeTracks(ids) {
  const set = new Set(ids);
  S.tracks = S.tracks.filter(t => !set.has(t.id));
  await DB.delMany('tracks', ids);
  for (const id of ids) { P.dropAudio(id).catch(() => { }); if (covers.has(id)) { URL.revokeObjectURL(covers.get(id)); covers.delete(id); } }
  const touched = [];
  for (const p of S.playlists) { const before = p.trackIds.length; p.trackIds = p.trackIds.filter(x => !set.has(x)); if (p.trackIds.length !== before) touched.push(p); }
  await DB.putMany('playlists', touched);
  reindex();
  for (const id of ids) if (P.Q.queue.includes(id)) P.removeFromQueue(id);
}
async function saveToLib(t) {
  if (inLib(t.id)) return index.get(t.id);
  const { live, ...rest } = t; const rec = { ...rest, added: Date.now(), fav: false };
  S.tracks.push(rec); reindex(); await DB.put('tracks', rec).catch(() => { });
  return rec;
}
async function toggleFav(id) {
  const t = byId(id); if (!t) return;
  if (t.src === 'radio') {
    const on = S.radios.some(r => r.id === id);
    if (on) { S.radios = S.radios.filter(r => r.id !== id); await DB.del('radios', id).catch(() => { }); toast('Rádio removida das suas rádios'); }
    else { const r = { ...t }; S.radios.push(r); await DB.put('radios', r).catch(() => { }); toast('Rádio salva em Suas rádios'); }
    reindex();
  } else {
    const lib = inLib(id) ? index.get(id) : await saveToLib(t);
    lib.fav = !lib.fav; await DB.put('tracks', lib).catch(() => { });
    toast(lib.fav ? 'Adicionada às favoritas' : 'Removida das favoritas');
  }
  render(); renderPlayer();
}
async function newPlaylist(name, addId) {
  const pl = { id: uid(), name: name.trim().slice(0, 80) || 'Nova playlist', trackIds: [], created: Date.now() };
  if (addId) { const t = byId(addId); if (t) { await saveToLib(t); pl.trackIds.push(addId); } }
  S.playlists.push(pl); await DB.put('playlists', pl).catch(() => { }); return pl;
}
async function addToPl(plId, id) {
  const pl = S.playlists.find(p => p.id === plId), t = byId(id); if (!pl || !t) return;
  if (pl.trackIds.includes(id)) { toast(`Já está em “${pl.name}”`); return; }
  await saveToLib(t); pl.trackIds.push(id); await DB.put('playlists', pl).catch(() => { });
  toast(`Adicionada a “${pl.name}”`); render();
}

/* ---------- folhas ---------- */
let sheetKeep = false;
function openSheet(html, keep) {
  sheetKeep = !!keep; $('#sheet').innerHTML = html; $('#sheetWrap').hidden = false;
  if (!keep) setTimeout(() => ($('#sheet input:not([type=checkbox])') || $('#sheet button'))?.focus({ preventScroll: true }), 60);
}
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }
const sheetHead = t => `<div class="sheet-head">${thumb(t)}<span class="meta"><span class="t">${esc(t.title)}</span><span class="a">${esc(t.artist || '')}${t.album && t.album !== t.artist ? ' · ' + esc(t.album) : ''}</span></span></div>`;
function trackMenu(id, ctx) {
  const t = byId(id); if (!t) return;
  const a = [], lib = inLib(id), act = (k, ic, l, extra = '', cls = '') => a.push(`<button class="act ${cls}" data-act="${k}" data-id="${esc(id)}" ${extra}>${ic}${l}</button>`);
  if (t.src === 'radio') {
    const fav = S.radios.some(r => r.id === id);
    act('m-fav', fav ? I.heartF : I.heart, fav ? 'Remover de Suas rádios' : 'Salvar em Suas rádios');
    return openSheet(sheetHead(t) + `<div class="acts">${a.join('')}</div>`);
  }
  act('m-next', I.playnext, 'Tocar a seguir'); act('m-queue', I.queue, 'Adicionar ao fim da fila');
  if (t.src !== 'podcast') {
    act('m-addpl', I.addpl, 'Adicionar à playlist');
    act('m-fav', t.fav ? I.heartF : I.heart, t.fav ? 'Remover das favoritas' : 'Favoritar');
  }
  if (t.src === 'jamendo' && !lib) act('m-save', I.plus, 'Salvar na biblioteca');
  if (t.src === 'drive') P.isOffline(id) ? act('m-undl', I.minus, 'Remover download') : act('m-dl', I.dl, 'Baixar para ouvir offline');
  if (ctx === 'pl' && S.plOpen) act('m-rmpl', I.minus, 'Tirar desta playlist');
  if (t.src === 'jamendo' && t.shareurl) a.push(`<a class="act" href="${esc(t.shareurl)}" target="_blank" rel="noopener">${I.ext}Ver no Jamendo</a>`);
  if (t.src === 'local') act('m-del', I.trash, 'Excluir do aparelho', '', 'danger');
  if (t.src === 'jamendo' && lib) act('m-unsave', I.trash, 'Remover da biblioteca', '', 'danger');
  openSheet(sheetHead(t) + `<div class="acts">${a.join('')}</div>`);
}
function addPlSheet(id) {
  const t = byId(id), pls = S.playlists.slice().sort((a, b) => b.created - a.created);
  openSheet(sheetHead(t) + `<h3>Adicionar à playlist</h3><form id="plForm" data-add="${esc(id)}"><input class="field" id="plName" placeholder="Nome da nova playlist" maxlength="80" autocomplete="off"><div class="row-btns"><button class="btn primary" type="submit">${I.plus}Criar e adicionar</button></div></form>
    ${pls.length ? `<div class="acts" style="margin-top:10px">${pls.map(p => `<button class="act" data-act="m-topl" data-pl="${p.id}" data-id="${esc(id)}">${I.lists}${esc(p.name)}<small>${p.trackIds.length}</small></button>`).join('')}</div>` : ''}`);
}

/* ---------- eventos ---------- */
function listFor(ctx) { return S.lists[ctx] || []; }
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (el.tagName === 'A') return;
  switch (a) {
    case 'tab': {
      const tab = el.dataset.tab;
      if (tab === S.tab) { if (tab === 'playlists') S.plOpen = null; if (tab === 'podcasts') S.podOpen = null; }
      S.tab = tab; persist(); render(); scrollTo(0, 0); break;
    }
    case 'play': {
      const list = listFor(el.dataset.ctx), i = +el.dataset.i;
      if (P.curId() === id && P.Q.queue.length) { P.toggle(); break; }
      if (list[i]?.src === 'radio') Src.countClick(list[i].uuid);
      P.playList(list, i >= 0 ? i : 0, list[i]?.src === 'podcast' ? false : P.Q.shuffle); break;
    }
    case 'playall': { const l = listFor(el.dataset.ctx); if (P.Q.shuffle) { P.Q.shuffle = false; persist(); } P.playList(l, 0, false); break; }
    case 'shuffleall': { const l = listFor(el.dataset.ctx); P.Q.shuffle = true; persist(); P.playList(l, Math.floor(Math.random() * l.length), true); break; }
    case 'menu': e.stopPropagation(); trackMenu(id, el.dataset.ctx); break;
    case 'menucur': if (P.cur()) trackMenu(P.curId(), 'player'); break;
    case 'toggle': P.toggle(); break;
    case 'next': P.next(false); break;
    case 'prev': P.prev(); break;
    case 'back15': P.au.currentTime = Math.max(0, P.au.currentTime - 15); break;
    case 'fwd30': P.au.currentTime = Math.min((P.au.duration || 1e9) - 1, P.au.currentTime + 30); break;
    case 'shuffle': P.setShuffle(!P.Q.shuffle); persist(); toast(P.Q.shuffle ? 'Aleatório ligado' : 'Aleatório desligado'); break;
    case 'repeat': { const r = P.cycleRepeat(); persist(); toast(r === 'one' ? 'Repetindo esta' : r === 'all' ? 'Repetindo a fila' : 'Repetir desligado'); break; }
    case 'favcur': if (P.cur()) toggleFav(P.curId()); break;
    case 'openplayer': $('#player').hidden = false; renderPlayer(); $('#plClose').focus({ preventScroll: true }); break;
    case 'closeplayer': $('#player').hidden = true; break;
    case 'jumpq': P.jump(+el.dataset.i); break;
    case 'closesheet': closeSheet(); break;
    case 'filter': S.filter = el.dataset.f; $$('.chip-btn[data-f]').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === S.filter)); refreshSongList(); break;
    // menu de música
    case 'm-next': closeSheet(); P.playNext(byId(id)); toast('Vai tocar a seguir'); break;
    case 'm-queue': closeSheet(); P.addQueue(byId(id)); toast('Adicionada ao fim da fila'); break;
    case 'm-fav': closeSheet(); toggleFav(id); break;
    case 'm-save': closeSheet(); await saveToLib(byId(id)); toast('Salva na biblioteca'); render(); break;
    case 'm-unsave': closeSheet(); await removeTracks([id]); toast('Removida da biblioteca'); render(); break;
    case 'm-addpl': addPlSheet(id); break;
    case 'm-topl': closeSheet(); addToPl(el.dataset.pl, id); break;
    case 'm-dl': closeSheet(); downloadTracks([byId(id)]); break;
    case 'm-undl': closeSheet(); await P.setAudioKind(id, 'cache'); toast('Download removido'); rerenderSoft(); break;
    case 'm-rmpl': {
      closeSheet(); const pl = S.playlists.find(p => p.id === S.plOpen);
      if (pl) { pl.trackIds = pl.trackIds.filter(x => x !== id); DB.put('playlists', pl).catch(() => { }); render(); toast('Tirada da playlist'); }
      break;
    }
    case 'm-del': openSheet(sheetHead(byId(id)) + `<h3>Excluir esta música?</h3><p>Ela sai deste aparelho e de todas as playlists. O arquivo original continua onde estava.</p><div class="row-btns"><button class="btn" data-act="closesheet">Cancelar</button><button class="btn danger" data-act="m-delok" data-id="${esc(id)}">${I.trash}Excluir</button></div>`); break;
    case 'm-delok': closeSheet(); await removeTracks([id]); render(); toast('Música excluída'); break;
    // playlists
    case 'newpl': openSheet(`<h3>Nova playlist</h3><form id="plForm"><input class="field" id="plName" placeholder="Ex.: Treino, Viagem, Domingo" maxlength="80" autocomplete="off"><div class="row-btns"><button class="btn" type="button" data-act="closesheet">Cancelar</button><button class="btn primary" type="submit">Criar</button></div></form>`); break;
    case 'openpl': S.plOpen = id; render(); scrollTo(0, 0); break;
    case 'backpl': S.plOpen = null; render(); break;
    case 'dlpl': { const pl = S.playlists.find(p => p.id === id); if (pl) downloadTracks(pl.trackIds.map(byId).filter(Boolean)); break; }
    case 'plmenu': { const pl = S.playlists.find(p => p.id === id); if (!pl) break; openSheet(`<h3>${esc(pl.name)}</h3><div class="acts"><button class="act" data-act="pl-ren" data-id="${id}">${I.edit}Renomear</button><button class="act danger" data-act="pl-del" data-id="${id}">${I.trash}Apagar playlist</button></div>`); break; }
    case 'pl-ren': { const pl = S.playlists.find(p => p.id === id); openSheet(`<h3>Renomear playlist</h3><form id="renForm" data-id="${id}"><input class="field" id="renName" value="${esc(pl.name)}" maxlength="80" autocomplete="off"><div class="row-btns"><button class="btn" type="button" data-act="closesheet">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`); break; }
    case 'pl-del': { const pl = S.playlists.find(p => p.id === id); openSheet(`<h3>Apagar “${esc(pl.name)}”?</h3><p>Só a playlist é apagada. As músicas continuam na biblioteca.</p><div class="row-btns"><button class="btn" data-act="closesheet">Cancelar</button><button class="btn danger" data-act="pl-delok" data-id="${id}">Apagar</button></div>`); break; }
    case 'pl-delok': closeSheet(); S.playlists = S.playlists.filter(p => p.id !== id); DB.del('playlists', id).catch(() => { }); S.plOpen = null; render(); toast('Playlist apagada'); break;
    // rádios / jamendo / podcasts
    case 'rtag': S.radio.tag = el.dataset.tag; S.radio.q = ''; loadRadio(); break;
    case 'rretry': loadRadio(); break;
    case 'jtag': S.jam.tag = el.dataset.tag; S.jam.q = ''; loadJam(); break;
    case 'jretry': loadJam(); break;
    case 'psuggest': S.pod.q = el.dataset.q; searchPods(); break;
    case 'pclear': S.pod.q = ''; S.pod.results = null; render(); break;
    case 'openpod': { const p = S.podcasts.find(x => x.id === id) || (S.pod.results || []).find(x => x.id === id); if (p) openPodcast(p); break; }
    case 'backpod': S.podOpen = null; render(); break;
    case 'follow': {
      const p = S.podOpen; if (!p) break;
      if (S.podcasts.some(x => x.id === p.id)) { S.podcasts = S.podcasts.filter(x => x.id !== p.id); DB.del('podcasts', p.id).catch(() => { }); toast('Você deixou de seguir'); }
      else { S.podcasts.push(p); DB.put('podcasts', p).catch(() => { }); toast('Seguindo ' + p.title); }
      render(); break;
    }
    // drive
    case 'signin': closeSheet(); signIn(el.dataset.ret); break;
    case 'signout': Drive.signOut(); toast('Você saiu da conta do Google'); render(); break;
    case 'pickfolder': if (!Drive.token()) askSignIn('pickfolder'); else folderPicker(true); break;
    case 'fpin': FP.stack.push({ id, name: el.dataset.name }); folderPicker(); break;
    case 'fpup': FP.stack = FP.stack.slice(0, +el.dataset.i + 1); folderPicker(); break;
    case 'fpuse': {
      const f = FP.stack.at(-1), rec = $('#fpRec')?.checked ?? true, prev = cfg().folder;
      setCfg({ folder: { id: f.id, name: f.name, recursive: rec } }); closeSheet();
      if (prev && prev.id !== f.id) toast('Pasta trocada. Músicas da pasta anterior saem da biblioteca.', 3500);
      render(); syncDrive(true); break;
    }
    case 'sync': syncDrive(true); break;
    case 'copy': {
      const txt = $('#' + el.dataset.target)?.textContent || '';
      try { await navigator.clipboard.writeText(txt); toast('Copiado'); }
      catch (err) { const r = document.createRange(); r.selectNodeContents($('#' + el.dataset.target)); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selecionado; copie pelo menu do iPhone'); }
      break;
    }
    case 'clearcache': await P.clearCache(); toast('Armazenamento temporário limpo'); render(); break;
  }
});
async function searchPods() {
  const D = S.pod; if (!D.q.trim()) return;
  D.loading = true; D.error = ''; S.podOpen = null; render();
  try { D.results = await Src.searchPodcasts(D.q.trim()); } catch (e) { D.error = 'Não foi possível buscar agora. Confira sua internet.'; D.results = null; }
  D.loading = false; if (S.tab === 'podcasts') render();
}
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'plForm') {
    const name = $('#plName').value, add = f.dataset.add; if (!name.trim()) { $('#plName').focus(); return; }
    const pl = await newPlaylist(name, add); closeSheet();
    toast(add ? `Adicionada a “${pl.name}”` : `Playlist “${pl.name}” criada`);
    if (!add) { S.tab = 'playlists'; S.plOpen = pl.id; persist(); }
    render();
  } else if (f.id === 'renForm') {
    const pl = S.playlists.find(p => p.id === f.dataset.id), v = $('#renName').value.trim();
    if (pl && v) { pl.name = v.slice(0, 80); DB.put('playlists', pl).catch(() => { }); }
    closeSheet(); render();
  } else if (f.id === 'radioForm') { S.radio.q = $('#rq').value; loadRadio(); $('#rq')?.blur(); }
  else if (f.id === 'jamSearch') { S.jam.q = $('#jq').value; loadJam(); }
  else if (f.id === 'podSearch') { S.pod.q = $('#pq').value; searchPods(); }
  else if (f.id === 'jamForm') { const v = $('#jamId').value.trim(); setCfg({ jamendoClientId: v }); S.jam.results = null; S.jam.error = ''; toast(v ? 'Chave do Jamendo salva' : 'Chave removida'); render(); }
  else if (f.id === 'gForm') {
    const v = $('#gId').value.trim();
    if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { toast('Esse não parece um Client ID do Google. Ele termina em .apps.googleusercontent.com', 4500); return; }
    setCfg({ googleClientId: v }); toast(v ? 'Client ID salvo. Agora toque em Entrar com Google.' : 'Client ID removido', 3500); render();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.q = e.target.value; refreshSongList(); }
  if (e.target.id === 'pq' && !e.target.value) { S.pod.q = ''; S.pod.results = null; render(); $('#pq')?.focus(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'sort') { S.sort = t.value; persist(); refreshSongList(); }
  if (t.id === 'file') { importFiles(t.files); t.value = ''; }
  if (t.id === 'rcountry') { S.radio.country = t.value; persist(); loadRadio(); }
  if (t.id === 'recursive') { const f = cfg().folder; if (f) { setCfg({ folder: { ...f, recursive: t.checked } }); syncDrive(true); } }
  if (t.id === 'cachelim') { P.setCacheLimit(+t.value); toast('Limite atualizado'); }
});
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') { if (!$('#sheetWrap').hidden) closeSheet(); else if (!$('#player').hidden) $('#player').hidden = true; return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"],label[for]')) { e.preventDefault(); e.target.click(); return; }
  if (e.key === ' ' && !['input', 'textarea', 'select', 'button'].includes(tag)) { e.preventDefault(); P.toggle(); }
});
let dragN = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragN++; document.body.classList.add('drag'); });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; document.body.classList.remove('drag'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragN = 0; document.body.classList.remove('drag'); if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files); });

// Re-renderiza sem atrapalhar quem está digitando na busca.
function rerenderSoft() {
  if (S.tab === 'songs' && $('#q') && document.activeElement === $('#q')) { refreshSongList(); const b = $('.banner'); if (b) b.outerHTML = driveBanner() || '<span></span>'; return; }
  if (S.tab === 'settings' && document.activeElement?.matches('input.field')) return;
  render();
}

/* ---------- início ---------- */
async function boot() {
  setStatic();
  const back = Drive.handleRedirect();
  if (back) { const tab = lsGet('vdb-return-tab'); if (tab) { S.tab = tab; lsSet('vdb-return-tab', null); } }
  render();
  await DB.openDB();
  const [tr, pl, ra, po] = await Promise.all([DB.all('tracks'), DB.all('playlists'), DB.all('radios'), DB.all('podcasts')]);
  S.tracks = tr; S.playlists = pl; S.radios = ra; S.podcasts = po;
  reindex();
  await P.loadAudioIndex();
  P.restoreQueue();
  const res = lsGet('vdb-resume'); if (res) { P.Q.resumeAt = res; lsSet('vdb-resume', null); }
  if (!DB.hasDB()) toast('Este navegador não permitiu salvar dados. Use o Safari fora do modo privado.', 5000);
  render(); updateDock();
  if (back?.error) toast(back.error, 4500);
  else if (back?.ok) {
    toast('Conectado ao Google Drive');
    if (back.ret === 'pickfolder' || !cfg().folder) folderPicker(true);
    else syncDrive();
  } else if (cfg().folder && Drive.token() && Date.now() - (lsGet('vdb-lastsync') || 0) > 6 * 3600e3) syncDrive();
  else if (Drive.token()) { tagQueue = S.tracks.filter(t => t.src === 'drive' && !t.tagged); runTagging(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
boot();
