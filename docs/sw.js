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
const VERSION = 'ec7b6660ed';
const CACHE = `church-slide-${VERSION}`;
const PRECACHE = ["./","./assets/app-7VXOSNB2.css","./assets/app-BXPPQL4O.js","./assets/asset-3IL6PPXX.woff","./assets/asset-5PBWBXRJ.woff","./assets/asset-5T6GPYQK.woff","./assets/asset-7M45XVOL.woff","./assets/asset-EERIBSW5.woff","./assets/asset-F74Z34KW.woff","./assets/asset-F756ID3Y.woff","./assets/asset-GB4EZLBU.woff","./assets/asset-GC4MSG2N.woff","./assets/asset-HXDY4KLM.woff","./assets/asset-IYKSYYDX.woff","./assets/asset-J3LFX7SK.woff","./assets/asset-JHSHERE5.woff","./assets/asset-LPMVUIV5.woff","./assets/asset-M2MVUWVK.woff","./assets/asset-OKTSHOTN.woff","./assets/asset-PDKCJHCU.woff","./assets/asset-PT7TPK3E.woff","./assets/asset-Q3IFVBWM.woff","./assets/asset-QK4FFX35.woff","./assets/asset-QVNBJYES.woff","./assets/asset-RUSP5VXO.woff","./assets/asset-U55MBHXJ.woff","./assets/asset-VS2GL66I.woff","./assets/asset-X5F6CACG.woff","./assets/asset-XNVYNKFS.woff","./assets/asset-ZND77FMK.woff","./icon-192.png","./icon-512.png","./icon.svg","./manifest.webmanifest","./index.html"];

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
