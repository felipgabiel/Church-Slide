import { normalizeProject, newProject } from '../defaults';
import { uid } from '../ids';
import type { Aspect, Project, Theme } from '../types';
import { clone } from '../util';
import { dbDelete, dbGet, dbGetAll, dbPut } from './db';
import { tr } from '../i18n';

export async function listProjects(): Promise<Project[]> {
  const all = await dbGetAll<unknown>('projects');
  return all
    .map((p) => {
      try {
        return normalizeProject(p);
      } catch {
        return null;
      }
    })
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | null> {
  const raw = await dbGet<unknown>('projects', id);
  return raw ? normalizeProject(raw) : null;
}

export async function saveProject(project: Project): Promise<Project> {
  const saved = { ...project, updatedAt: Date.now() };
  await dbPut('projects', saved);
  return saved;
}

export async function createProject(
  name: string,
  opts: { theme?: Theme; aspect?: Aspect; category?: string; artist?: string } = {},
): Promise<Project> {
  const p = newProject(name.trim() || tr('Novo louvor'), opts);
  await dbPut('projects', p);
  return p;
}

export async function duplicateProject(id: string, newName?: string): Promise<Project | null> {
  const src = await getProject(id);
  if (!src) return null;
  return cloneProject(src, newName ?? tr('{0} (cópia)', src.name), { isTemplate: false });
}

/** Cria uma cópia com novos ids de projeto e de trechos/camadas. */
export async function cloneProject(src: Project, name: string, patch: Partial<Project> = {}): Promise<Project> {
  const now = Date.now();
  const copy: Project = {
    ...clone(src),
    ...patch,
    id: uid('p'),
    name,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  copy.slides = copy.slides.map((s) => ({ ...s, id: uid('s'), layers: s.layers.map((l) => ({ ...l, id: uid('l') })) }));
  await dbPut('projects', copy);
  return copy;
}

export async function updateMeta(id: string, patch: Partial<Pick<Project, 'name' | 'artist' | 'category'>>): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  await dbPut('projects', { ...p, ...patch, updatedAt: Date.now() });
}

/** Salva uma cópia do projeto como modelo reutilizável. */
export async function saveAsTemplate(id: string, name: string): Promise<Project | null> {
  const src = await getProject(id);
  if (!src) return null;
  return cloneProject(src, name, { isTemplate: true });
}

/** Exclusão reversível: o projeto vai para a lixeira. */
export async function trashProject(id: string): Promise<void> {
  const p = await getProject(id);
  if (p) await dbPut('projects', { ...p, deletedAt: Date.now() });
}

export async function restoreProject(id: string): Promise<void> {
  const p = await getProject(id);
  if (p) await dbPut('projects', { ...p, deletedAt: null, updatedAt: Date.now() });
}

export async function purgeProject(id: string): Promise<void> {
  await dbDelete('projects', id);
  await dbDelete('snapshots', id);
}

/* ---------------- Cópia de segurança (recuperação) ---------------- */

interface SnapshotRecord {
  id: string;
  savedAt: number;
  project: Project;
}

export async function writeSnapshot(project: Project): Promise<void> {
  await dbPut<SnapshotRecord>('snapshots', { id: project.id, savedAt: Date.now(), project });
}

export async function readSnapshot(id: string): Promise<{ savedAt: number; project: Project } | null> {
  const s = await dbGet<SnapshotRecord>('snapshots', id);
  return s ? { savedAt: s.savedAt, project: normalizeProject(s.project) } : null;
}

export async function restoreFromSnapshot(id: string): Promise<Project | null> {
  const snap = await readSnapshot(id);
  if (!snap) return null;
  const restored = { ...snap.project, deletedAt: null, updatedAt: Date.now() };
  await dbPut('projects', restored);
  return restored;
}

/** Categorias já usadas, em ordem alfabética. */
export function collectCategories(projects: Project[]): string[] {
  return [...new Set(projects.map((p) => p.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
