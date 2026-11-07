import { useSyncExternalStore } from 'react';

/** Rotas por #hash: funcionam offline, sem servidor, e em qualquer pasta de hospedagem. */
export type Route =
  | { name: 'library' }
  | { name: 'edit'; id: string }
  | { name: 'present'; id: string }
  | { name: 'output' };

export const paths = {
  library: '#/',
  edit: (id: string) => `#/edit/${id}`,
  present: (id: string) => `#/present/${id}`,
  output: '#/output',
};

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b] = parts;
  if (a === 'edit' && b) return { name: 'edit', id: decodeURIComponent(b) };
  if (a === 'present' && b) return { name: 'present', id: decodeURIComponent(b) };
  if (a === 'output') return { name: 'output' };
  return { name: 'library' };
}

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '');
  return parseRoute(hash);
}

export function navigate(path: string) {
  if (location.hash === path) return;
  location.hash = path;
}
