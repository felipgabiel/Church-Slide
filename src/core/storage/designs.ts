import { sanitizeDesign } from '../design/model';
import type { BackgroundDesign } from '../types';
import { dbDelete, dbGet, dbGetAll, dbPut } from './db';

/** "Meus fundos": fundos do Estúdio, guardados neste navegador. */

const listeners = new Set<() => void>();
/** Avisa telas abertas (galeria, aba Fundos do editor) que a lista mudou. */
export function onDesignsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

export async function listDesigns(): Promise<BackgroundDesign[]> {
  const all = await dbGetAll<unknown>('designs');
  return all
    .map(sanitizeDesign)
    .filter((d): d is BackgroundDesign => !!d)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDesign(id: string): Promise<BackgroundDesign | null> {
  return sanitizeDesign(await dbGet<unknown>('designs', id));
}

export async function saveDesign(d: BackgroundDesign, touch = true): Promise<BackgroundDesign> {
  const rec = touch ? { ...d, updatedAt: Date.now() } : d;
  await dbPut('designs', rec);
  changed();
  return rec;
}

export async function deleteDesign(id: string): Promise<void> {
  await dbDelete('designs', id);
  changed();
}
