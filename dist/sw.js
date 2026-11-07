/* Church Slide — service worker (offline-first).
 * Gerado por scripts/build.mjs, que preenche a versão e a lista de pré-cache abaixo.
 *
 * Estratégia:
 *  - Instalação: pré-carrega todo o aplicativo (HTML, JS, CSS, ícones).
 *  - Navegação: sempre responde com o index.html do cache (o app usa rotas por #hash).
 *  - Demais GET da mesma origem: cache primeiro, atualiza em segundo plano.
 *  - Projetos, letras e mídia ficam no IndexedDB do navegador — não dependem deste cache.
 */
const VERSION = '20dd24615f';
const CACHE = `church-slide-${VERSION}`;
const PRECACHE = ["./","./assets/app-4IYTQLUT.css","./assets/app-PICAFWND.js","./icon-192.png","./icon-512.png","./icon.svg","./manifest.webmanifest","./index.html"];

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
      caches.match('./index.html').then((hit) => hit || fetch(req).catch(() => new Response('Offline', { status: 503 }))),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        event.waitUntil(refresh);
        return hit;
      }
      return (await refresh) || new Response('Offline', { status: 503 });
    }),
  );
});
