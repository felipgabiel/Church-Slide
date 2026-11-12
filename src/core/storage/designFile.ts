import { designMediaIds } from '../design/paint';
import { copyDesign, sanitizeDesign } from '../design/model';
import type { BackgroundDesign, MediaRecord } from '../types';
import { slugify } from '../util';
import { saveDesign } from './designs';
import { blobToDataUrl, EXT } from './exchange';
import { addMedia, getMedia } from './media';
import { tr } from '../i18n';

/**
 * Fundo do Estúdio em arquivo (`.csfundo.json`), para levar a outro computador ou mandar para outra igreja.
 * As imagens e vídeos das camadas vão junto, embutidos.
 */
const FORMAT = 'church-slide-background';
const VERSION = 1;

interface DesignFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  design: BackgroundDesign;
  media: Record<string, { name: string; kind: MediaRecord['kind']; mime: string; data: string }>;
}

export async function exportDesignFile(design: BackgroundDesign): Promise<Blob> {
  const media: DesignFile['media'] = {};
  for (const id of designMediaIds(design)) {
    const m = await getMedia(id);
    if (m) media[id] = { name: m.name, kind: m.kind, mime: m.mime, data: await blobToDataUrl(m.blob) };
  }
  const file: DesignFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), design, media };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export const designFileName = (d: BackgroundDesign) => `${slugify(d.name) || 'fundo'}.csfundo.json`;

/** Lê o arquivo e salva em "Meus fundos" como um fundo novo. A mídia que já existe aqui é reaproveitada. */
export async function importDesignFile(file: File): Promise<BackgroundDesign> {
  let parsed: DesignFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(tr('O arquivo não é um JSON válido.'));
  }
  if (parsed?.format !== FORMAT || !parsed.design) throw new Error(tr('Este arquivo não é um fundo do Church Slide.'));
  if (typeof parsed.version === 'number' && parsed.version > VERSION) throw new Error(tr('Este fundo foi criado por uma versão mais nova do Church Slide.'));
  let json = JSON.stringify(parsed.design);
  for (const [oldId, m] of Object.entries(parsed.media ?? {})) {
    try {
      if (await getMedia(oldId)) continue; // o mesmo arquivo já está neste computador
      const blob = await (await fetch(m.data)).blob();
      const rec = await addMedia(new File([blob], `${m.name}${EXT[m.mime] ?? ''}`, { type: m.mime }));
      json = json.split(oldId).join(rec.id);
    } catch (err) {
      console.warn('[import] mídia do fundo ignorada', m.name, err);
    }
  }
  const design = sanitizeDesign(JSON.parse(json));
  if (!design) throw new Error(tr('Este arquivo não é um fundo do Church Slide.'));
  return saveDesign(copyDesign(design));
}
