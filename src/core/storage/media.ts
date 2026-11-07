import { uid } from '../ids';
import type { MediaRecord } from '../types';
import { dbDelete, dbGet, dbGetAll, dbPut } from './db';

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

export function detectKind(file: File): MediaRecord['kind'] | null {
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  if (file.type.startsWith('font/') || FONT_EXT.test(file.name)) return 'font';
  return null;
}

/* ---------------- miniaturas ---------------- */

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.8));
}

async function imageThumb(blob: Blob): Promise<Blob | undefined> {
  try {
    const bmp = await createImageBitmap(blob);
    const w = 320;
    const h = Math.max(1, Math.round((bmp.height / bmp.width) * w));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await canvasToBlob(canvas);
  } catch {
    return undefined;
  }
}

async function videoThumb(blob: Blob): Promise<Blob | undefined> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 6000);
      video.onloadeddata = () => {
        clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(t);
        reject(new Error('erro de vídeo'));
      };
    });
    const target = Math.min(1, (video.duration || 1) / 3);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = target;
      setTimeout(resolve, 2000);
    });
    const w = 320;
    const h = Math.max(1, Math.round(((video.videoHeight || 9) / (video.videoWidth || 16)) * w));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    return await canvasToBlob(canvas);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------- CRUD ---------------- */

export async function addMedia(file: File): Promise<MediaRecord> {
  const kind = detectKind(file);
  if (!kind) throw new Error(`Formato não suportado: ${file.name}`);
  const blob: Blob = file;
  const rec: MediaRecord = {
    id: uid('m'),
    name: file.name.replace(/\.[^.]+$/, ''),
    kind,
    mime: file.type || (kind === 'video' ? 'video/mp4' : kind === 'font' ? 'font/ttf' : 'image/jpeg'),
    size: file.size,
    createdAt: Date.now(),
    blob,
  };
  if (kind === 'image') rec.thumb = await imageThumb(blob);
  else if (kind === 'video') rec.thumb = await videoThumb(blob);
  else rec.family = `CS Font ${rec.id.slice(-6)}`;
  await dbPut('media', rec);
  return rec;
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  return dbGet<MediaRecord>('media', id);
}

export async function listMedia(kind?: MediaRecord['kind']): Promise<MediaRecord[]> {
  const all = await dbGetAll<MediaRecord>('media');
  return all.filter((m) => !kind || m.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
}

export async function putMediaRecord(rec: MediaRecord): Promise<void> {
  await dbPut('media', rec);
}

export async function deleteMedia(id: string): Promise<void> {
  revokeMediaUrls(id);
  await dbDelete('media', id);
}

export async function renameMedia(id: string, name: string): Promise<void> {
  const m = await getMedia(id);
  if (m) await dbPut('media', { ...m, name });
}

/* ---------------- URLs de objeto (cache) ---------------- */

const urlCache = new Map<string, Promise<string | null>>();
const thumbCache = new Map<string, Promise<string | null>>();

export function getMediaUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id);
  if (!p) {
    p = getMedia(id).then((m) => (m ? URL.createObjectURL(m.blob) : null));
    urlCache.set(id, p);
  }
  return p;
}

export function getThumbUrl(id: string): Promise<string | null> {
  let p = thumbCache.get(id);
  if (!p) {
    p = getMedia(id).then((m) => (m?.thumb ? URL.createObjectURL(m.thumb) : null));
    thumbCache.set(id, p);
  }
  return p;
}

export function revokeMediaUrls(id: string) {
  for (const cache of [urlCache, thumbCache]) {
    cache.get(id)?.then((u) => u && URL.revokeObjectURL(u));
    cache.delete(id);
  }
}

/* ---------------- Fontes personalizadas ---------------- */

const loadedFonts = new Set<string>();

export async function loadCustomFonts(): Promise<{ id: string; family: string; name: string }[]> {
  const fonts = await listMedia('font');
  const out: { id: string; family: string; name: string }[] = [];
  for (const f of fonts) {
    const family = f.family ?? `CS Font ${f.id.slice(-6)}`;
    out.push({ id: f.id, family, name: f.name });
    if (loadedFonts.has(f.id)) continue;
    try {
      const face = new FontFace(family, await f.blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      loadedFonts.add(f.id);
    } catch (err) {
      console.warn('[fonts] falha ao carregar', f.name, err);
    }
  }
  return out;
}

/* ---------------- Pré-aquecimento de vídeo (apresentação) ---------------- */

const warmVideos = new Map<string, HTMLVideoElement>();

/** Baixa o início do vídeo do próximo fundo para que a troca não engasgue. */
export async function warmMedia(id: string | null | undefined) {
  if (!id || warmVideos.has(id)) return;
  const m = await getMedia(id);
  if (!m || m.kind !== 'video') return;
  const url = await getMediaUrl(id);
  if (!url) return;
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  warmVideos.set(id, v);
  if (warmVideos.size > 6) {
    const first = warmVideos.keys().next().value as string;
    const old = warmVideos.get(first);
    if (old) old.removeAttribute('src');
    warmVideos.delete(first);
  }
}
