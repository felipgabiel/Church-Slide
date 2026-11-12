import { normalizeProject } from '../defaults';
import { uid } from '../ids';
import type { MediaRecord, Project } from '../types';
import { slugify } from '../util';
import { addMedia, getMedia, listMedia } from './media';
import { dbPut } from './db';
import { tr } from '../i18n';

/**
 * Formato de intercâmbio `.churchslide.json`:
 * { format, version, exportedAt, project, media: { [id]: { name, kind, mime, data(dataURL) } } }
 * A mídia usada pelo projeto vai embutida para o arquivo funcionar em outro computador.
 */

const FORMAT = 'church-slide';
const VERSION = 1;

interface ExportedMedia {
  name: string;
  kind: MediaRecord['kind'];
  mime: string;
  family?: string;
  data: string;
}

interface ExportFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  project: Project;
  media: Record<string, ExportedMedia>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Ids de mídia e famílias de fonte referenciadas por um projeto. */
export function collectMediaRefs(project: Project): { mediaIds: Set<string>; families: Set<string> } {
  const json = JSON.stringify(project);
  const mediaIds = new Set<string>(json.match(/\bm_[a-z0-9]{12}\b/g) ?? []);
  const families = new Set<string>(json.match(/CS Font [a-z0-9]{6}/gi) ?? []);
  return { mediaIds, families };
}

export async function exportProject(project: Project, includeMedia = true): Promise<Blob> {
  const media: Record<string, ExportedMedia> = {};
  if (includeMedia) {
    const { mediaIds, families } = collectMediaRefs(project);
    const fontIds = (await listMedia('font')).filter((f) => f.family && families.has(f.family)).map((f) => f.id);
    for (const id of new Set([...mediaIds, ...fontIds])) {
      const m = await getMedia(id);
      if (!m) continue;
      media[id] = { name: m.name, kind: m.kind, mime: m.mime, family: m.family, data: await blobToDataUrl(m.blob) };
    }
  }
  const file: ExportFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    project: { ...project, deletedAt: null },
    media,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export function exportFileName(project: Project): string {
  return `${slugify(project.name)}.churchslide.json`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
};

/** Lê um arquivo `.churchslide.json`, recria a mídia localmente e salva o projeto com novo id. */
export async function importProjectFile(file: File): Promise<Project> {
  let parsed: ExportFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(tr('O arquivo não é um JSON válido.'));
  }
  if (parsed?.format !== FORMAT || !parsed.project) throw new Error(tr('Este arquivo não é um projeto do Church Slide.'));
  if (typeof parsed.version === 'number' && parsed.version > VERSION) {
    throw new Error(tr('Este projeto foi criado por uma versão mais nova do Church Slide.'));
  }

  let json = JSON.stringify(parsed.project);
  for (const [oldId, m] of Object.entries(parsed.media ?? {})) {
    try {
      const blob = await (await fetch(m.data)).blob();
      const ext = EXT[m.mime] ?? '';
      const rec = await addMedia(new File([blob], `${m.name}${ext}`, { type: m.mime }));
      json = json.split(oldId).join(rec.id);
      if (m.family && rec.family) json = json.split(m.family).join(rec.family);
    } catch (err) {
      console.warn('[import] mídia ignorada', m.name, err);
    }
  }

  const project = normalizeProject(JSON.parse(json));
  const now = Date.now();
  const imported: Project = {
    ...project,
    id: uid('p'),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    slides: project.slides.map((s) => ({ ...s, id: uid('s'), layers: s.layers.map((l) => ({ ...l, id: uid('l') })) })),
  };
  await dbPut('projects', imported);
  return imported;
}
