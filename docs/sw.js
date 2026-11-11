/* Church Slide — service worker (offline-first).
 * Gerado por scripts/build.mjs, que preenche a versão e a lista de pré-cache abaixo.
 *
 * Estratégia:
 *  - Instalação: pré-carrega todo o aplicativo (HTML, JS, CSS, ícones).
 *  - Navegação (index.html): REDE primeiro (até 4 s), cache se estiver sem internet. Assim uma versão nova
 *    publicada aparece no próximo acesso — antes a página vinha sempre do cache e o navegador podia ficar
 *    preso numa versão antiga (ou pedir arquivos que já não existem no servidor).
 *  - Demais GET da mesma origem: cache (de qualquer versão guardada) primeiro, senão rede.
 *  - Projetos, letras e mídia ficam no IndexedDB do navegador — não dependem deste cache.
 */
const VERSION = '4893d92877';
const CACHE = `church-slide-${VERSION}`;
const PRECACHE = ["./","./assets/app-5BR7Z3CF.css","./assets/app-N262MPSM.js","./assets/asset-5T6GPYQK.woff","./assets/asset-7M45XVOL.woff","./assets/asset-F74Z34KW.woff","./icon-192.png","./icon-512.png","./icon.svg","./manifest.webmanifest","./index.html"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('church-slide-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 4000);
          const res = await fetch('./index.html', { cache: 'no-store', signal: ctrl.signal });
          clearTimeout(timer);
          if (res.ok) {
            cache.put('./index.html', res.clone());
            return res;
          }
        } catch {
          /* sem internet ou lento: usa o guardado */
        }
        return (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })(),
  );
});
