// Fidelidade do exportador: compara o canvas (vídeo) com o DOM real do editor, quadro a quadro.
//   npm run e2e:fidelity   (precisa de ffmpeg no PATH para medir PSNR)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { buildOptions } from '../scripts/options.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.env.FIDELITY_OUT || mkdtempSync(join(tmpdir(), 'cs-fid-'));
mkdirSync(out, { recursive: true });

await build({ ...buildOptions, entryPoints: { harness: new URL('./fidelity/harness.tsx', import.meta.url).pathname }, outdir: out, logLevel: 'error', define: { 'process.env.NODE_ENV': '"development"' } });
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><script type="module" src="harness.js"></script>');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  const f = join(out, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  try { res.setHeader('content-type', MIME[extname(f)] ?? 'application/octet-stream'); res.end(readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
}).listen(0);
const port = srv.address().port;

const psnr = (a, b) => {
  const r = execFileSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return r;
};
const measure = (a, b) => {
  try { execFileSync('ffmpeg', ['-v', 'error', '-i', a, '-i', b, '-lavfi', 'psnr=stats_file=/dev/null', '-f', 'null', '-']); } catch {}
  const res = require('node:child_process').spawnSync('ffmpeg', ['-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /average:([\d.]+|inf)/.exec(res.stderr);
  return m ? (m[1] === 'inf' ? 99 : parseFloat(m[1])) : NaN;
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => !!window.H);

const grad = (c1, c2, c3) => ({ angle: 160, stops: [{ color: c1, at: 0 }, { color: c2, at: 50 }, { color: c3, at: 100 }] });
const baseBg = (patch) => page.evaluate(() => null).then(() => patch);
const bgs = [];
for (const kind of ['aurora', 'drift', 'bokeh', 'rays', 'waves']) {
  for (const t of [0, 7.3, 21.9]) bgs.push({ name: `fundo ${kind} t=${t}s`, kind, t });
}

const cases = [];
for (const b of bgs) {
  cases.push({
    name: b.name,
    min: 30,
    run: () => page.evaluate(async ({ kind, t }) => {
      const base = { kind: 'animated', animated: kind, color: '#0a0204', gradient: { angle: 160, stops: [{ color: '#ff5a1f', at: 0 }, { color: '#d4152b', at: 50 }, { color: '#5c0b1c', at: 100 }] }, mediaId: null, speed: 1, scale: 100, posX: 50, posY: 50, adjust: { brightness: 100, contrast: 100, saturate: 100, blur: 0, dim: 0 } };
      return window.H.background(base, t);
    }, b),
    shot: true,
  });
}
cases.push({ name: 'fundo degradê (160°, 3 cores)', min: 38, shot: true, run: () => page.evaluate(() => window.H.background({ kind: 'gradient', animated: 'aurora', color: '#000', gradient: { angle: 160, stops: [{ color: '#ff5a1f', at: 0 }, { color: '#d4152b', at: 50 }, { color: '#5c0b1c', at: 100 }] }, mediaId: null, speed: 1, scale: 100, posX: 50, posY: 50, adjust: { brightness: 100, contrast: 100, saturate: 100, blur: 0, dim: 0 } }, 0)) });
cases.push({ name: 'fundo aurora + brilho/contraste/saturação/escurecer', min: 30, shot: true, run: () => page.evaluate(() => window.H.background({ kind: 'animated', animated: 'aurora', color: '#0a0204', gradient: { angle: 160, stops: [{ color: '#6d5cff', at: 0 }, { color: '#00c2ff', at: 50 }, { color: '#ff4da6', at: 100 }] }, mediaId: null, speed: 1, scale: 100, posX: 50, posY: 50, adjust: { brightness: 120, contrast: 110, saturate: 130, blur: 0, dim: 25 } }, 5)) });
cases.push({ name: 'texto: 1 linha padrão', min: 24, shot: true, run: () => page.evaluate(() => window.H.text({ text: 'Grande é o Senhor' })) });
cases.push({ name: 'texto: várias linhas + acentos', min: 24, shot: true, run: () => page.evaluate(() => window.H.text({ text: 'Santo, Santo, Santo\nDeus Todo-Poderoso\nQue era, que é e que há de vir' })) });
cases.push({ name: 'texto: layout Impacto (palavras com tamanhos/pesos diferentes)', min: 24, shot: true, run: () => page.evaluate(() => window.H.text({ text: 'Vem sobre mim Senhor', impact: true })) });
cases.push({ name: 'texto: sombra + brilho + contorno', min: 22, shot: true, run: () => page.evaluate(() => window.H.text({ text: 'Aleluia\nAleluia', patch: (p) => { const s = p.slides[0].layers[0].style; s.shadow = { enabled: true, color: '#000000', x: 0, y: 4, blur: 14 }; s.glow = { enabled: true, color: '#ffd27a', blur: 24 }; s.stroke = { enabled: true, color: '#7a1020', width: 5 }; s.color = '#ffffff'; } })) });
cases.push({ name: 'texto: caixa girada (-12°) fora do centro', min: 24, shot: true, run: () => page.evaluate(() => window.H.text({ text: 'Vem sobre mim Senhor', impact: true, patch: (p) => { const s = p.slides[0].layers[0].style; s.rotation = -12; s.x = 42; s.y = 46; } })) });
cases.push({ name: 'texto: itálico, espaçamento e alinhamento à esquerda', min: 24, shot: true, run: () => page.evaluate(() => window.H.text({ text: 'Tu és fiel\nSenhor meu Deus', patch: (p) => { const s = p.slides[0].layers[0].style; s.italic = true; s.letterSpacing = 8; s.align = 'left'; s.x = 40; s.fontSize = 10; } })) });

let failed = 0;
console.log(`\nFidelidade do exportador (canvas × DOM real) → ${out}\n`);
let i = 0;
for (const c of cases) {
  i++;
  const dataUrl = await c.run();
  const ref = await page.locator('#ref').screenshot();
  const refPath = join(out, `${String(i).padStart(2, '0')}-ref.png`);
  const cvPath = join(out, `${String(i).padStart(2, '0')}-canvas.png`);
  writeFileSync(refPath, ref);
  writeFileSync(cvPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const db = measure(refPath, cvPath);
  const ok = db >= c.min;
  if (!ok) failed++;
  console.log(`  ${ok ? '✔' : '✘'} ${c.name}  PSNR ${db.toFixed(1)} dB (mín. ${c.min})`);
}
console.log(errs.length ? `\nerros de página: ${errs.join(' | ')}` : '');
await browser.close();
srv.close();
console.log(`\n${cases.length - failed}/${cases.length} dentro do limite\n`);
process.exit(failed || errs.length ? 1 : 0);
