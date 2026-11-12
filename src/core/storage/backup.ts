import { normalizeProject } from '../defaults';
import { sanitizeDesign } from '../design/model';
import { buildZip, type ZipFile } from '../export/zip';
import { tr } from '../i18n';
import type { BackgroundDesign, MediaRecord, Project } from '../types';
import { dbGet, dbGetAll, dbPut } from './db';
import { saveDesign } from './designs';
import { EXT } from './exchange';

/**
 * Backup de TUDO o que está neste navegador num arquivo .zip:
 *   church-slide-backup.json  → louvores (inclusive modelos e lixeira), "Meus fundos", preferências e a lista da mídia
 *   media/<id>.<ext>           → imagens, vídeos e fontes, como foram enviados
 *   thumbs/<id>.jpg            → miniaturas da mídia
 * Restaurar MESCLA: o que falta entra, o que existe nos dois fica com a versão editada por último. Nada é apagado.
 */

export const BACKUP_FORMAT = 'church-slide-backup';
const VERSION = 1;
const MANIFEST = 'church-slide-backup.json';
/** preferências que não fazem sentido levar (estado de tela) */
const SKIP_SETTINGS = new Set(['cs:last-backup']);
export const LAST_BACKUP_SETTING = 'last-backup';

interface MediaEntry {
  id: string;
  name: string;
  kind: MediaRecord['kind'];
  mime: string;
  size: number;
  createdAt: number;
  family?: string;
  file: string;
  thumb?: string;
}

interface Manifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  projects: Project[];
  designs: BackgroundDesign[];
  media: MediaEntry[];
  settings: Record<string, string>;
}

export interface BackupSummary {
  projects: number;
  designs: number;
  media: number;
  bytes: number;
}

function readSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cs:') && !SKIP_SETTINGS.has(k)) out[k] = localStorage.getItem(k) ?? '';
    }
  } catch {
    /* sem localStorage: segue sem preferências */
  }
  return out;
}

const extOf = (m: { mime: string; name: string; kind: MediaRecord['kind'] }) => EXT[m.mime] ?? (m.kind === 'video' ? '.mp4' : m.kind === 'font' ? '.ttf' : '.jpg');

export const backupFileName = (d = new Date()) => `church-slide-backup-${d.toISOString().slice(0, 10)}.zip`;

/** Monta o .zip do backup. `onProgress` recebe de 0 a 1. */
export async function buildBackup(onProgress?: (f: number) => void): Promise<{ blob: Blob; summary: BackupSummary }> {
  const [projects, designs, media] = await Promise.all([dbGetAll<Project>('projects'), dbGetAll<BackgroundDesign>('designs'), dbGetAll<MediaRecord>('media')]);
  const files: ZipFile[] = [];
  const entries: MediaEntry[] = [];
  media.forEach((m, i) => {
    const file = `media/${m.id}${extOf(m)}`;
    files.push({ name: file, data: m.blob });
    let thumb: string | undefined;
    if (m.thumb) {
      thumb = `thumbs/${m.id}.jpg`;
      files.push({ name: thumb, data: m.thumb });
    }
    entries.push({ id: m.id, name: m.name, kind: m.kind, mime: m.mime, size: m.size, createdAt: m.createdAt, family: m.family, file, thumb });
    onProgress?.((0.5 * (i + 1)) / Math.max(1, media.length));
  });
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    projects,
    designs,
    media: entries,
    settings: readSettings(),
  };
  files.unshift({ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest)) });
  const blob = await buildZip(files);
  onProgress?.(1);
  return { blob, summary: { projects: projects.filter((p) => !p.deletedAt).length, designs: designs.length, media: media.length, bytes: blob.size } };
}

/* ------------------------------ leitura do .zip ------------------------------ */

/**
 * Leitor de ZIP mínimo: lê o diretório central e devolve cada arquivo como Blob (sem carregar tudo na memória).
 * Aceita "store" (o que o Church Slide grava) e "deflate" (se a pessoa recompactou o arquivo).
 */
export async function readZip(zip: Blob): Promise<Map<string, () => Promise<Blob>>> {
  const tailSize = Math.min(zip.size, 66_000);
  const tail = new DataView(await zip.slice(zip.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(tr('Este arquivo não é um backup do Church Slide.'));
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await zip.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map<string, () => Promise<Blob>>();
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true);
    const csize = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    out.set(name, async () => {
      const lh = new DataView(await zip.slice(local, local + 30).arrayBuffer());
      const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      const raw = zip.slice(start, start + csize);
      if (method === 0) return raw;
      if (method === 8 && typeof DecompressionStream !== 'undefined') {
        return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      }
      throw new Error(tr('Este arquivo não é um backup do Church Slide.'));
    });
  }
  return out;
}

export interface RestoreResult {
  projectsAdded: number;
  projectsUpdated: number;
  designsAdded: number;
  designsUpdated: number;
  media: number;
  skipped: number;
}

/** Lê um backup e mescla com o que já existe neste navegador. */
export async function restoreBackup(file: Blob, onProgress?: (f: number) => void): Promise<RestoreResult> {
  const zip = await readZip(file);
  const getManifest = zip.get(MANIFEST);
  if (!getManifest) throw new Error(tr('Este arquivo não é um backup do Church Slide.'));
  let m: Manifest;
  try {
    m = JSON.parse(await (await getManifest()).text());
  } catch {
    throw new Error(tr('Este arquivo não é um backup do Church Slide.'));
  }
  if (m?.format !== BACKUP_FORMAT) throw new Error(tr('Este arquivo não é um backup do Church Slide.'));
  if (typeof m.version === 'number' && m.version > VERSION) throw new Error(tr('Este backup foi feito por uma versão mais nova do Church Slide.'));

  const r: RestoreResult = { projectsAdded: 0, projectsUpdated: 0, designsAdded: 0, designsUpdated: 0, media: 0, skipped: 0 };
  const media = Array.isArray(m.media) ? m.media : [];
  const total = media.length + 1;

  // mídia primeiro: os louvores e fundos apontam para ela pelo id
  for (let i = 0; i < media.length; i++) {
    const e = media[i];
    onProgress?.((i + 1) / total);
    if (!e || typeof e.id !== 'string' || !/^m_[a-z0-9]+$/i.test(e.id)) continue;
    if (await dbGet<MediaRecord>('media', e.id)) continue;
    const get = zip.get(e.file);
    if (!get) {
      r.skipped++;
      continue;
    }
    try {
      const blob = new Blob([await get()], { type: e.mime });
      const thumbGet = e.thumb ? zip.get(e.thumb) : undefined;
      const thumb = thumbGet ? new Blob([await thumbGet()], { type: 'image/jpeg' }) : undefined;
      const kind: MediaRecord['kind'] = e.kind === 'video' || e.kind === 'font' ? e.kind : 'image';
      await dbPut<MediaRecord>('media', {
        id: e.id,
        name: String(e.name ?? '').slice(0, 200),
        kind,
        mime: String(e.mime || ''),
        size: blob.size,
        createdAt: Number(e.createdAt) || Date.now(),
        blob,
        thumb,
        family: kind === 'font' ? e.family ?? `CS Font ${e.id.slice(-6)}` : undefined,
      });
      r.media++;
    } catch {
      r.skipped++;
    }
  }

  for (const raw of Array.isArray(m.projects) ? m.projects : []) {
    try {
      const p = normalizeProject(raw);
      const cur = await dbGet<Project>('projects', p.id);
      if (cur && (cur.updatedAt ?? 0) >= (p.updatedAt ?? 0)) continue;
      await dbPut('projects', p);
      if (cur) r.projectsUpdated++;
      else r.projectsAdded++;
    } catch {
      r.skipped++;
    }
  }

  for (const raw of Array.isArray(m.designs) ? m.designs : []) {
    const d = sanitizeDesign(raw);
    if (!d) {
      r.skipped++;
      continue;
    }
    const cur = sanitizeDesign(await dbGet<unknown>('designs', d.id));
    if (cur && cur.updatedAt >= d.updatedAt) continue;
    await saveDesign(d, false);
    if (cur) r.designsUpdated++;
    else r.designsAdded++;
  }

  // preferências: só as que ainda não existem aqui (não muda o que a pessoa já configurou neste computador)
  try {
    for (const [k, v] of Object.entries(m.settings ?? {})) {
      if (k.startsWith('cs:') && typeof v === 'string' && localStorage.getItem(k) === null && !SKIP_SETTINGS.has(k)) localStorage.setItem(k, v);
    }
  } catch {
    /* ignore */
  }
  onProgress?.(1);
  return r;
}
