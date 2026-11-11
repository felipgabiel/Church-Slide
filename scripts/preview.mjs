// Servidor estático simples para testar o build de produção (inclui o service worker em localhost).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../docs');
const port = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

/** `base`: serve o site dentro de uma subpasta (ex.: "/church-slide/"), como o GitHub Pages faz com o nome do repositório. */
export function startPreview(p = port, base = '/') {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (!url.pathname.startsWith(base)) throw new Error('fora da subpasta');
      let file = normalize(join(dist, decodeURIComponent(url.pathname.slice(base.length))));
      if (!file.startsWith(dist)) throw new Error('fora de docs');
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': file.endsWith('sw.js') || file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Não encontrado');
    }
  });
  return new Promise((r) => server.listen(p, '127.0.0.1', () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.BASE_PATH || '/';
  await startPreview(port, base);
  console.log(`\n  Church Slide (build)  →  http://localhost:${port}${base}\n`);
}
