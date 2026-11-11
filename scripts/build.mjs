// Build de produção: esbuild (bundle + minificação) + index.html com hashes + service worker com pré-cache.
import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { buildOptions } from './options.mjs';

const root = resolve(import.meta.dirname, '..');
// O site pronto vai para `docs/`: é a pasta que o GitHub Pages publica (Settings → Pages → main → /docs),
// então quem abre o link não precisa instalar nem compilar nada.
const dist = join(root, 'docs');

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(join(dist, '.nojekyll'), ''); // o Pages não deve processar a pasta com Jekyll

const result = await build({
  ...buildOptions,
  outdir: join(dist, 'assets'),
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  assetNames: 'asset-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  sourcemap: false,
  metafile: true,
});

// arquivos públicos (manifest, ícones…)
try {
  await cp(join(root, 'public'), dist, { recursive: true });
} catch {
  /* sem pasta public */
}

// index.html com os nomes finais (hash) dos assets
const outputs = Object.keys(result.metafile.outputs).map((p) => relative(dist, resolve(p)).split(sep).join('/'));
const js = outputs.find((o) => /^assets\/app-.*\.js$/.test(o));
const css = outputs.find((o) => /^assets\/app-.*\.css$/.test(o));
let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace('./assets/app.js', `./${js}`).replace('./assets/app.css', `./${css}`);
await writeFile(join(dist, 'index.html'), html);

// service worker: lista de pré-cache + versão baseada no conteúdo
const files = (await walk(dist)).map((p) => relative(dist, p).split(sep).join('/')).filter((p) => p !== 'sw.js' && p !== '.nojekyll');
const hash = createHash('sha1');
for (const f of files.sort()) hash.update(f).update(await readFile(join(dist, f)));
const version = hash.digest('hex').slice(0, 10);
const precache = ['./', ...files.filter((f) => f !== 'index.html').map((f) => `./${f}`), './index.html'];
const sw = (await readFile(join(root, 'scripts/sw.template.js'), 'utf8'))
  .replaceAll('__VERSION__', version)
  .replaceAll('__PRECACHE__', JSON.stringify(precache));
// Trava: um marcador esquecido vira erro de script no navegador e desliga o modo offline em silêncio.
const leftover = sw.match(/__[A-Z_]+__/g);
if (leftover) throw new Error(`sw.js gerado ainda contém marcadores sem substituir: ${[...new Set(leftover)].join(', ')}`);
await writeFile(join(dist, 'sw.js'), sw);

const size = async (f) => ((await stat(join(dist, f))).size / 1024).toFixed(0);
console.log(`\n✔ docs/ pronto — versão ${version}`);
console.log(`  ${js} ${await size(js)} KB · ${css} ${await size(css)} KB · ${precache.length} arquivos no pré-cache`);
