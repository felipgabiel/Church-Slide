import type { DeepPartial } from './types';
import { LANG, tr } from './i18n';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Blob);
}

/** Mescla `patch` em `target` sem mutar (objetos aninhados são mesclados, arrays substituídos). */
export function deepMerge<T>(target: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return target;
  if (!isPlainObject(target) || !isPlainObject(patch)) return (patch as unknown as T) ?? target;
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(patch)) {
    const pv = (patch as Record<string, unknown>)[key];
    if (pv === undefined) continue;
    const tv = (target as Record<string, unknown>)[key];
    out[key] = isPlainObject(tv) && isPlainObject(pv) ? deepMerge(tv, pv as never) : pv;
  }
  return out as T;
}

/**
 * Preenche campos ausentes de `val` com os de `def` (recursivo). Usado para
 * migrar projetos antigos quando novos campos são adicionados ao modelo.
 */
export function fillDefaults<T>(def: T, val: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(val) ? val : def) as unknown as T;
  if (isPlainObject(def)) {
    const v = isPlainObject(val) ? val : {};
    const out: Record<string, unknown> = { ...v };
    for (const key of Object.keys(def)) {
      out[key] = fillDefaults((def as Record<string, unknown>)[key], v[key]);
    }
    return out as T;
  }
  return (val === undefined || val === null || typeof val !== typeof def ? def : val) as T;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...a);
    }, ms);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
    t = undefined;
  };
  return wrapped;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return tr('agora há pouco');
  const m = Math.round(s / 60);
  if (m < 60) return tr('há {0} min', m);
  const h = Math.round(m / 60);
  if (h < 24) return tr('há {0} h', h);
  const d = Math.round(h / 24);
  if (d < 30) return tr('há {0} {1}', d, d === 1 ? tr('dia') : tr('dias'));
  return new Date(ts).toLocaleDateString(LANG);
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'projeto'
  );
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const out = arr.slice();
  const [item] = out.splice(from, 1);
  out.splice(clamp(to, 0, out.length), 0, item);
  return out;
}
