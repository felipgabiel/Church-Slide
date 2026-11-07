import { useCallback, useSyncExternalStore } from 'react';

/** Preferências locais simples (localStorage) com hook reativo. */
const listeners = new Set<() => void>();

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`cs:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeSetting<T>(key: string, value: T) {
  try {
    localStorage.setItem(`cs:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const subscribe = useCallback((fn: () => void) => {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => e.key === `cs:${key}` && fn();
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(fn);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);
  // serializa para manter a identidade estável entre renders
  const raw = useSyncExternalStore(subscribe, () => {
    try {
      return localStorage.getItem(`cs:${key}`);
    } catch {
      return null;
    }
  });
  const value = raw === null ? fallback : (JSON.parse(raw) as T);
  const set = useCallback((v: T) => writeSetting(key, v), [key]);
  return [value, set];
}
