// Leitura de etiquetas ID3 (título, artista, álbum, capa) e utilidades de arquivo.
const ss = (b, o) => ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);
const be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function dec(bytes, enc) {
  try {
    const lab = enc === 1 ? (bytes[0] === 0xFE ? 'utf-16be' : 'utf-16le') : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'iso-8859-1';
    return new TextDecoder(lab).decode(bytes).replace(/^﻿/, '').replace(/\u0000+$/, '').split('\u0000')[0].trim();
  } catch (e) { return ''; }
}

// Quantos bytes do início do arquivo são necessários para ler as etiquetas (0 = sem ID3).
export function id3Size(head) {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  return 10 + ss(head, 6);
}

export async function readTags(blob) {
  const out = {};
  try {
    const h = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    if (!id3Size(h)) return out;
    const ver = h[3]; if (ver < 3 || ver > 4) return out;
    const size = ss(h, 6), buf = new Uint8Array(await blob.slice(10, 10 + size).arrayBuffer());
    let p = 0;
    if (h[5] & 0x40) p += ver === 4 ? ss(buf, 0) : be(buf, 0) + 4;
    while (p + 10 <= buf.length) {
      const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? ss(buf, p + 4) : be(buf, p + 4);
      const data = buf.subarray(p + 10, p + 10 + fs); p += 10 + fs;
      if (!fs) continue;
      if (id === 'TIT2') out.title = dec(data.subarray(1), data[0]);
      else if (id === 'TPE1') out.artist = dec(data.subarray(1), data[0]);
      else if (id === 'TALB') out.album = dec(data.subarray(1), data[0]);
      else if (id === 'APIC' && !out.cover && data.length > 16) {
        const enc = data[0]; let i = 1;
        while (i < data.length && data[i] !== 0) i++;
        let mime = new TextDecoder('iso-8859-1').decode(data.subarray(1, i)).toLowerCase(); i += 2;
        if (enc === 1 || enc === 2) { while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2; i += 2; }
        else { while (i < data.length && data[i] !== 0) i++; i += 1; }
        if (!mime.includes('/')) mime = mime.includes('png') ? 'image/png' : 'image/jpeg';
        if (mime === 'image/jpg') mime = 'image/jpeg';
        if (i < data.length) out.cover = new Blob([data.slice(i)], { type: mime });
      }
    }
    if (out.cover) out.cover = await shrinkCover(out.cover);
  } catch (e) { }
  return out;
}

// Reduz a capa para 360px em JPEG, para não ocupar espaço demais no aparelho.
export async function shrinkCover(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', .82));
    return out || blob;
  } catch (e) { return blob.size < 200000 ? blob : null; }
}

export function parseName(name) {
  let b = String(name).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  b = b.replace(/^\d{1,3}\s*[-.)]?\s+/, '');
  const m = b.split(/\s+-\s+/);
  return m.length >= 2 ? { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() } : { artist: '', title: b };
}

export const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|aiff?|alac|mp4)$/i;

export function probeDuration(blob) {
  return new Promise(res => {
    const a = document.createElement('audio'), u = URL.createObjectURL(blob); let done = false;
    const fin = d => { if (done) return; done = true; URL.revokeObjectURL(u); a.removeAttribute('src'); res(isFinite(d) && d > 0 ? d : 0); };
    a.preload = 'metadata'; a.onloadedmetadata = () => fin(a.duration); a.onerror = () => fin(0);
    setTimeout(() => fin(0), 4000); a.src = u;
  });
}

export function formatLabel(mime, name = '') {
  const ty = (mime || '').toLowerCase(), n = name.toLowerCase();
  if (ty.includes('mpeg') || ty.includes('mp3') || n.endsWith('.mp3')) return 'MP3';
  if (ty.includes('mp4') || ty.includes('m4a') || ty.includes('aac') || /\.(m4a|aac)$/.test(n)) return 'AAC';
  if (ty.includes('flac') || n.endsWith('.flac')) return 'FLAC';
  if (ty.includes('wav') || n.endsWith('.wav')) return 'WAV';
  if (ty.includes('aiff') || /\.aiff?$/.test(n)) return 'AIFF';
  if (ty.includes('ogg') || n.endsWith('.ogg')) return 'OGG';
  return (ty.split('/')[1] || 'ÁUDIO').toUpperCase();
}
