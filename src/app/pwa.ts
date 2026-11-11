import { useEffect, useState } from 'react';

/** Registra o service worker (somente em build de produção servido por HTTPS ou localhost). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  window.addEventListener('load', () => {
    // updateViaCache 'none': o navegador sempre confere se há sw.js novo (versão nova publicada)
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {
        /* em desenvolvimento não há sw.js: tudo bem */
      });
  });
}

export type OfflineState = 'unsupported' | 'checking' | 'ready' | 'none';

/** Informa se o aplicativo já está guardado para uso sem internet. */
export function useOfflineReady(): OfflineState {
  const [state, setState] = useState<OfflineState>('serviceWorker' in navigator ? 'checking' : 'unsupported');
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let alive = true;
    const check = async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (!alive) return;
      const active = regs.some((r) => r.active);
      setState(active ? 'ready' : 'none');
    };
    void check();
    const t = setInterval(check, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return state;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}
