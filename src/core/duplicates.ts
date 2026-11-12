import type { Project } from './types';

/**
 * Louvores repetidos: mesmo nome e mesmo autor (sem diferenciar maiúsculas, acentos e espaços extras).
 * Só vale na hora de CRIAR: renomear depois para um nome que já existe é permitido.
 */
export const sameKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function findDuplicate(projects: Pick<Project, 'name' | 'artist' | 'isTemplate' | 'deletedAt'>[], name: string, artist: string) {
  const n = sameKey(name);
  const a = sameKey(artist);
  return projects.find((p) => !p.isTemplate && !p.deletedAt && sameKey(p.name) === n && sameKey(p.artist ?? '') === a) ?? null;
}

/** "Oceanos" → "Oceanos (1)"; se já houver "(1)", "(2)", e assim por diante. */
export function numberedName(name: string, existing: string[]): string {
  const base = name.trim().replace(/\s*\(\d+\)$/, '');
  const taken = new Set(existing.map(sameKey));
  for (let i = 1; i < 10000; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(sameKey(candidate))) return candidate;
  }
  return `${base} (${Date.now()})`;
}
