// Servidor de desenvolvimento: esbuild em modo watch + servidor estático com recarregamento automático.
import { context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildOptions } from './options.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, '.cache/dev');
const port = Number(process.env.PORT) || 5173;

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });
try {
  await cp(join(root, 'public'), out, { recursive: true });
} catch {
  /* sem public */
}
let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace('</body>', `<script>new EventSource('/esbuild').addEventListener('change', () => location.reload())</script></body>`);
await writeFile(join(out, 'index.html'), html);

const ctx = await context({
  ...buildOptions,
  entryNames: '[name]',
  outdir: join(out, 'assets'),
  minify: false,
  sourcemap: 'inline',
  define: { 'process.env.NODE_ENV': '"development"' },
});
await ctx.watch();
const { hosts, port: p } = await ctx.serve({ servedir: out, port });
console.log(`\n  Church Slide (dev)  →  http://localhost:${p}/\n  ${hosts.join(', ')}\n`);
