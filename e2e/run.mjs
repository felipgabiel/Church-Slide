// Teste de ponta a ponta (Playwright) do build de produção.
//   npm run build && npm run e2e
// Cobre: criar louvor → editar → persistir → operador → janela do telão (sincronia) →
// tela preta → Motion Blur real → erros de console.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { startPreview } from '../scripts/preview.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.E2E_PORT) || 4199;
const BASE = `http://127.0.0.1:${PORT}/`;

const LYRICS = `Grande é o Senhor e muito digno de louvor
Na cidade do nosso Deus

Santo, Santo, Santo
Deus Todo-Poderoso

Eu te louvo, Senhor
Com todo o meu coração`;

const results = [];
const consoleErrors = [];

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✔ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    if (process.env.E2E_SHOTS) {
      for (const pg of ctx.pages()) await pg.screenshot({ path: join(process.env.E2E_SHOTS, `${results.length}-${pg.url().split('#')[1]?.replace(/\W+/g, '_') ?? 'x'}.png`) }).catch(() => undefined);
    }
    results.push({ name, ok: false, err });
    console.log(`  ✘ ${name}\n      ${String(err.message ?? err).split('\n')[0]}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const server = await startPreview(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'allow' });

const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] ${e.message}`));
};

const op = await ctx.newPage();
watch(op, 'operador');
let projectId = '';

console.log('\nChurch Slide · e2e\n');

await step('biblioteca abre vazia e sem erros', async () => {
  await op.goto(BASE);
  await op.getByRole('button', { name: /Novo louvor/i }).first().waitFor();
});

await step('cria um louvor com letra e divide em 3 trechos', async () => {
  await op.getByRole('button', { name: /Novo louvor/i }).first().click();
  await op.locator('dialog input').first().fill('Grande é o Senhor');
  await op.locator('dialog textarea').first().fill(LYRICS);
  await op.getByRole('button', { name: /Criar e abrir/i }).click();
  await op.waitForURL(/#\/edit\//);
  projectId = op.url().split('/edit/')[1];
  await op.getByRole('list', { name: 'Trechos do louvor' }).waitFor();
  const n = await op.getByRole('list', { name: 'Trechos do louvor' }).locator('li').count();
  assert(n === 3, `esperava 3 trechos, veio ${n}`);
});

await step('editar o texto salva automaticamente e sobrevive ao recarregar', async () => {
  const box = op.getByRole('textbox', { name: /Texto da camada/ });
  await box.fill('Texto editado no e2e');
  await op.getByText('Salvo', { exact: false }).first().waitFor();
  await op.waitForTimeout(900); // debounce do autosave
  await op.reload();
  await op.getByRole('list', { name: 'Trechos do louvor' }).waitFor();
  const txt = await op.getByRole('textbox', { name: /Texto da camada/ }).inputValue();
  assert(txt === 'Texto editado no e2e', `texto não persistiu: "${txt}"`);
});

await step('desfazer reverte a edição', async () => {
  await op.getByRole('textbox', { name: /Texto da camada/ }).fill('Outra edição');
  await op.waitForTimeout(500);
  await op.getByRole('button', { name: /Desfazer/i }).click();
  const txt = await op.getByRole('textbox', { name: /Texto da camada/ }).inputValue();
  assert(txt !== 'Outra edição', 'desfazer não reverteu');
});

await step('operador abre e mostra 1/3', async () => {
  await op.goto(`${BASE}#/present/${projectId}`);
  const count = op.locator('.op-count');
  await count.waitFor();
  assert((await count.getAttribute('aria-label')) === 'Trecho 1 de 3', 'contador inicial errado');
});

const out = await ctx.newPage();
watch(out, 'telão');

await step('janela do telão carrega o mesmo louvor', async () => {
  await out.goto(`${BASE}#/output`);
  await out.locator('.stage').first().waitFor({ timeout: 8000 });
  await out.waitForFunction(() => document.querySelectorAll('[data-unit]').length > 0, null, { timeout: 8000 });
});

const outText = () => out.evaluate(() => [...document.querySelectorAll('.out [data-unit]')].map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').trim());

await step('avançar no operador atualiza o telão (BroadcastChannel)', async () => {
  const before = await outText();
  // instala coletor de Motion Blur ANTES de avançar
  await out.evaluate(() => {
    window.__blur = { max: 0, filtered: 0, samples: 0 };
    const tick = () => {
      window.__blur.samples++;
      document.querySelectorAll('.stage-filters feGaussianBlur').forEach((n) => {
        const v = (n.getAttribute('stdDeviation') || '0 0').split(' ').map(Number);
        window.__blur.max = Math.max(window.__blur.max, ...v);
      });
      document.querySelectorAll('[data-unit]').forEach((u) => {
        if (u.style.filter && u.style.filter.includes('url(')) window.__blur.filtered++;
      });
      if (window.__blur.samples < 120) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await op.locator('.op').click({ position: { x: 5, y: 5 } });
  await op.keyboard.press('ArrowRight');
  await op.waitForFunction(() => document.querySelector('.op-count')?.getAttribute('aria-label') === 'Trecho 2 de 3');
  await out.waitForFunction((b) => ![...document.querySelectorAll('.out [data-unit]')].map((e) => e.textContent).join(' ').includes(b), before.slice(0, 12), { timeout: 4000 });
  const after = await outText();
  assert(after !== before, 'telão não mudou de trecho');
  assert(/Santo/.test(after), `trecho 2 esperado no telão, veio: "${after}"`);
});

await step('Motion Blur real: desfoque direcional aplicado durante o movimento', async () => {
  await out.waitForTimeout(1800);
  const b = await out.evaluate(() => window.__blur);
  assert(b.max > 0, `stdDeviation máximo ${b.max} (esperava > 0) em ${b.samples} quadros`);
});

await step('em repouso o filtro é removido das palavras (custo zero)', async () => {
  await out.waitForTimeout(1200);
  const stuck = await out.evaluate(() => [...document.querySelectorAll('[data-unit]')].filter((u) => u.style.filter && u.style.filter.includes('url(')).length);
  assert(stuck === 0, `${stuck} unidades ainda com filtro em repouso`);
});

await step('voltar (←) e tela preta (B) refletem no telão', async () => {
  await op.keyboard.press('ArrowLeft');
  await op.waitForFunction(() => document.querySelector('.op-count')?.getAttribute('aria-label') === 'Trecho 1 de 3');
  await op.keyboard.press('b');
  await out.waitForFunction(() => document.querySelector('.stage-black')?.getAttribute('data-on') === '1', null, { timeout: 3000 });
  await op.keyboard.press('b');
  await out.waitForFunction(() => document.querySelector('.stage-black')?.getAttribute('data-on') === '0', null, { timeout: 3000 });
});

await step('telão aberto DEPOIS recebe o estado atual (localStorage)', async () => {
  await op.keyboard.press('ArrowRight');
  await op.waitForFunction(() => document.querySelector('.op-count')?.getAttribute('aria-label') === 'Trecho 2 de 3');
  const late = await ctx.newPage();
  watch(late, 'telão-tardio');
  await late.goto(`${BASE}#/output`);
  await late.waitForFunction(() => document.querySelectorAll('.out [data-unit]').length > 0, null, { timeout: 8000 });
  const t = await late.evaluate(() => [...document.querySelectorAll('.out [data-unit]')].map((e) => e.textContent).join(' '));
  assert(/Santo/.test(t), `telão tardio mostrou "${t}"`);
  await late.close();
});

await step('atalhos personalizáveis: Esc cancela, conflito avisa, tecla nova vale no operador e no telão', async () => {
  await op.getByRole('button', { name: 'Atalhos de teclado' }).click();
  const dlg = op.locator('dialog[open]');
  await dlg.waitFor();
  const addBlack = dlg.getByRole('button', { name: /Adicionar tecla para Tela preta/ });
  const addReplay = dlg.getByRole('button', { name: /Adicionar tecla para Repetir animação/ });

  // Esc durante a captura cancela a captura, não fecha o diálogo
  await addBlack.click();
  await op.keyboard.press('Escape');
  await op.waitForTimeout(200);
  assert((await op.locator('dialog[open]').count()) === 1, 'Esc durante a captura fechou o diálogo');

  // atribui X a "Tela preta"
  await addBlack.click();
  await op.keyboard.press('x');
  await dlg.getByRole('button', { name: /Remover a tecla X de Tela preta/ }).waitFor({ timeout: 2000 });

  // conflito: X para "Repetir animação" tira de "Tela preta" e avisa
  await addReplay.click();
  await op.keyboard.press('x');
  const note = await dlg.locator('.sce-note').innerText();
  assert(/Tela preta/.test(note) && /Repetir animação/.test(note), `aviso de conflito ausente: "${note}"`);
  assert((await dlg.getByRole('button', { name: /Remover a tecla X de Repetir animação/ }).count()) === 1, 'X não foi para "Repetir animação"');

  // devolve X para "Tela preta"
  await addBlack.click();
  await op.keyboard.press('x');
  await dlg.getByRole('button', { name: /Remover a tecla X de Tela preta/ }).waitFor({ timeout: 2000 });

  // não permite número (1–9 são fixos)
  await addBlack.click();
  await op.keyboard.press('5');
  assert(/números 1–9/.test(await dlg.locator('.sce-note').innerText()), 'dígito deveria ser recusado');
  await op.keyboard.press('Escape');

  await dlg.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await op.locator('dialog[open]').waitFor({ state: 'detached' });

  // X no operador liga e desliga a tela preta do telão
  await op.locator('.op').click({ position: { x: 5, y: 5 } });
  await op.keyboard.press('x');
  await out.waitForFunction(() => document.querySelector('.stage-black')?.getAttribute('data-on') === '1', null, { timeout: 3000 });
  await op.keyboard.press('x');
  await out.waitForFunction(() => document.querySelector('.stage-black')?.getAttribute('data-on') === '0', null, { timeout: 3000 });

  // X apertado na JANELA DO TELÃO também chega ao operador
  await out.keyboard.press('x');
  await out.waitForFunction(() => document.querySelector('.stage-black')?.getAttribute('data-on') === '1', null, { timeout: 3000 });
  await out.keyboard.press('x');
  await out.waitForFunction(() => document.querySelector('.stage-black')?.getAttribute('data-on') === '0', null, { timeout: 3000 });
});

await step('atalhos persistem após recarregar e "Restaurar padrão" volta ao original', async () => {
  await op.reload();
  await op.locator('.op-count').waitFor();
  await op.getByRole('button', { name: 'Atalhos de teclado' }).click();
  const dlg = op.locator('dialog[open]');
  await dlg.getByRole('button', { name: /Remover a tecla X de Tela preta/ }).waitFor({ timeout: 2000 });
  await dlg.getByRole('button', { name: /Restaurar padrão/ }).click();
  await dlg.getByRole('button', { name: /Remover a tecla X de Tela preta/ }).waitFor({ state: 'detached', timeout: 2000 });
  await dlg.getByRole('button', { name: 'Fechar', exact: true }).last().click();
});

await step('modo offline: o telão recarrega sem rede (service worker)', async () => {
  await out.waitForTimeout(500);
  const swReady = await out.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const r = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
    return !!r;
  });
  assert(swReady, 'service worker não ficou ativo');
  await ctx.setOffline(true);
  try {
    await out.reload();
    await out.waitForFunction(() => document.querySelectorAll('.out [data-unit]').length > 0, null, { timeout: 8000 });
  } finally {
    await ctx.setOffline(false);
  }
});

await step('GitHub Pages: o site funciona numa subpasta (/church-slide/), sem arquivo faltando, e abre offline', async () => {
  const sub = await startPreview(PORT + 1, '/church-slide/');
  const pg = await ctx.newPage();
  const bad = [];
  pg.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
  pg.on('requestfailed', (r) => bad.push(`falhou ${r.url()}`));
  watch(pg, 'subpasta');
  try {
    const url = `http://127.0.0.1:${PORT + 1}/church-slide/`;
    await pg.goto(url);
    await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
    await pg.locator('dialog input').first().fill('Subpasta');
    await pg.locator('dialog textarea').first().fill('Aleluia\nAleluia');
    await pg.getByRole('button', { name: /Criar e abrir/i }).click();
    await pg.waitForURL(/#\/edit\//);
    await pg.getByRole('list', { name: 'Trechos do louvor' }).waitFor();
    await pg.waitForFunction(() => [...document.fonts].some((f) => f.status === 'loaded'), null, { timeout: 8000 });
    const scope = await pg.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    assert(scope.endsWith('/church-slide/'), `escopo do service worker: ${scope}`);
    await ctx.setOffline(true);
    try {
      await pg.reload();
      await pg.getByRole('list', { name: 'Trechos do louvor' }).waitFor({ timeout: 8000 });
    } finally {
      await ctx.setOffline(false);
    }
    assert(bad.length === 0, `requisições com erro:\n      ${bad.slice(0, 5).join('\n      ')}`);
  } finally {
    await pg.close();
    sub.close();
  }
});

await step('modo rápido (Impacto) + exportação: ZIP com um MP4 H.264 por trecho, animação + letra parada', async () => {
  const exp = await ctx.newPage();
  watch(exp, 'exportação');
  await exp.goto(BASE);
  await exp.getByRole('button', { name: /Novo louvor/i }).first().click();
  await exp.locator('dialog input').first().fill('Vem sobre mim');
  await exp.locator('dialog textarea').first().fill('Vem sobre mim Senhor\n\nEu quero te adorar\nSenhor');
  await exp.locator('dialog').getByText('Impacto', { exact: true }).click();
  await exp.getByRole('button', { name: /Criar e abrir/i }).click();
  await exp.waitForURL(/#\/edit\//);
  await exp.getByRole('list', { name: 'Trechos do louvor' }).waitFor();

  // fonte embutida: a Poppins do app (e não a do sistema) foi carregada e o texto usa peso/caixa do estilo
  await exp.waitForFunction(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Poppins' && f.status === 'loaded'), null, { timeout: 8000 });
  const big = await exp.evaluate(() => {
    const w = [...document.querySelectorAll('.surface [data-w]')].find((e) => e.textContent === 'Senhor');
    return w ? { text: getComputedStyle(w).textTransform, size: parseFloat(getComputedStyle(w).fontSize) } : null;
  });
  const small = await exp.evaluate(() => {
    const w = [...document.querySelectorAll('.surface [data-w]')].find((e) => e.textContent === 'Vem');
    return w ? { text: getComputedStyle(w).textTransform, size: parseFloat(getComputedStyle(w).fontSize) } : null;
  });
  assert(big && small, 'palavras do estilo Impacto não encontradas');
  assert(big.text === 'uppercase' && small.text === 'lowercase', `caixa errada: grande=${big.text} pequena=${small.text}`);
  assert(big.size > small.size * 1.8, `palavra-chave deveria ser bem maior (${big.size} vs ${small.size})`);

  await exp.getByRole('button', { name: /Exportar vídeos/ }).click();
  await exp.getByRole('button', { name: /^Gerar 2 vídeos$/ }).click();
  await exp.getByRole('button', { name: /Baixar tudo/ }).waitFor({ timeout: 240000 });
  const [dl] = await Promise.all([exp.waitForEvent('download'), exp.getByRole('button', { name: /Baixar tudo/ }).click()]);
  assert(/\.zip$/.test(dl.suggestedFilename()), `nome do arquivo: ${dl.suggestedFilename()}`);
  const dir = mkdtempSync(join(tmpdir(), 'cs-e2e-'));
  const zipPath = join(dir, 'saida.zip');
  await dl.saveAs(zipPath);
  const have = spawnSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
  assert(have.status === 0, 'unzip falhou — ZIP inválido');
  const mp4s = readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort();
  assert(mp4s.length === 2, `esperava 2 vídeos, veio ${mp4s.length}`);
  assert(/^01 - /.test(mp4s[0]) && /^02 - /.test(mp4s[1]), `numeração fora de ordem: ${mp4s.join(' | ')}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,duration', '-of', 'json', join(dir, mp4s[0])], { encoding: 'utf8' });
  if (probe.status === 0) {
    const s = JSON.parse(probe.stdout).streams[0];
    assert(s.codec_name === 'h264' && s.width === 1920 && s.height === 1080, `vídeo inesperado: ${JSON.stringify(s)}`);
    assert(Number(s.duration) >= 5.5, `duração ${s.duration}s: faltou o tempo com a letra parada`);
    const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, mp4s[0]), '-f', 'null', '-'], { encoding: 'utf8' });
    assert(dec.status === 0 && !dec.stderr.trim(), `vídeo não decodifica: ${dec.stderr.slice(0, 200)}`);
  } else {
    console.log('      (ffprobe ausente: conferi só a estrutura do ZIP)');
  }
  await exp.close();
});

await step('menu de clique direito: soltar a palavra mantém o lugar, arrastar move, desfazer volta em um passo', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'menu');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Menu');
  await pg.locator('dialog textarea').first().fill('Vem sobre mim Senhor');
  await pg.locator('dialog').getByText('Impacto', { exact: true }).click();
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  await pg.getByRole('list', { name: 'Trechos do louvor' }).waitFor();
  await pg.waitForTimeout(2200); // termina a animação de entrada
  const rectOf = (t) =>
    pg.evaluate((txt) => {
      const w = [...document.querySelectorAll('.surface [data-w]')].find((e) => e.textContent === txt);
      if (!w) return null;
      const r = w.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(w).fontSize) };
    }, t);
  const before = await rectOf('Senhor');
  assert(before, 'palavra Senhor não achada');
  await pg.mouse.click(before.cx, before.cy, { button: 'right' });
  const menu = pg.getByRole('menu', { name: 'Ações do texto' });
  await menu.waitFor();
  for (const label of ['Soltar para mover', 'Duplicar palavra', 'Excluir palavra', 'Duplicar linha', 'Excluir linha', 'Trazer para frente', 'Subir uma camada', 'Descer uma camada', 'Enviar para trás', 'Duplicar camada']) {
    assert((await menu.getByRole('menuitem', { name: label }).count()) === 1, `item ausente no menu: ${label}`);
  }
  const box = await menu.boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1600 && box.y + box.height <= 900, 'menu saiu da janela');
  await menu.getByRole('menuitem', { name: 'Soltar para mover' }).click();
  await pg.waitForTimeout(150);
  const after = await rectOf('Senhor');
  assert(after, 'palavra sumiu depois de soltar');
  assert(Math.abs(after.cx - before.cx) < 2 && Math.abs(after.cy - before.cy) < 2, `a palavra pulou: (${before.cx.toFixed(1)},${before.cy.toFixed(1)}) → (${after.cx.toFixed(1)},${after.cy.toFixed(1)})`);
  assert(Math.abs(after.fs - before.fs) < 0.6, `o tamanho mudou: ${before.fs} → ${after.fs}`);
  const layers = await pg.evaluate(() => document.querySelectorAll('.surface [data-layer]').length);
  assert(layers === 2, `esperava 2 camadas, veio ${layers}`);

  // arrasta a palavra solta para baixo
  await pg.mouse.move(after.cx, after.cy);
  await pg.mouse.down();
  await pg.mouse.move(after.cx, after.cy + 120, { steps: 8 });
  await pg.mouse.up();
  await pg.waitForTimeout(150);
  const moved = await rectOf('Senhor');
  assert(moved.cy - after.cy > 100, `a palavra não acompanhou o arraste (${after.cy} → ${moved.cy})`);
  const stay = await rectOf('sobre');
  assert(stay, 'o resto do texto sumiu');

  // desfazer: arraste, depois a separação (uma única vez), voltando a 1 camada
  const undo = pg.getByRole('button', { name: /Desfazer/i });
  await undo.click(); // arraste
  await undo.click(); // separação
  await pg.waitForTimeout(150);
  const back = await rectOf('Senhor');
  assert(back && Math.abs(back.cx - before.cx) < 2 && Math.abs(back.cy - before.cy) < 2, 'desfazer não devolveu a palavra ao lugar');
  const n1 = await pg.evaluate(() => document.querySelectorAll('.surface [data-layer]').length);
  assert(n1 === 1, `depois de desfazer deveria ter 1 camada, veio ${n1}`);

  // excluir e duplicar palavra
  await pg.mouse.click(back.cx, back.cy, { button: 'right' });
  await pg.getByRole('menuitem', { name: 'Duplicar palavra' }).click();
  const dup = await pg.evaluate(() => [...document.querySelectorAll('.surface [data-w]')].filter((e) => e.textContent === 'Senhor').length);
  assert(dup === 2, `duplicar palavra: esperava 2 "Senhor", veio ${dup}`);
  await pg.close();
});

await step('miniaturas dos visuais (Novo louvor) cabem em poucas linhas, sem estourar a caixa', async () => {
  for (const vp of [{ width: 1600, height: 900 }, { width: 1100, height: 800 }]) {
    const c = await browser.newContext({ viewport: vp });
    const pg = await c.newPage();
    watch(pg, 'miniaturas');
    await pg.goto(BASE);
    await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
    await pg.waitForTimeout(700);
    const info = await pg.evaluate(() =>
      [...document.querySelectorAll('dialog[open] .np-theme')].map((card) => {
        const words = [...card.querySelectorAll('[data-w]')];
        const rows = new Set(words.map((w) => Math.round(w.getBoundingClientRect().top))).size;
        const tr = card.querySelector('.thumb, .stage')?.getBoundingClientRect();
        const out = words.some((w) => {
          const r = w.getBoundingClientRect();
          return !!tr && (r.right > tr.right + 1 || r.left < tr.left - 1 || r.bottom > tr.bottom + 1 || r.top < tr.top - 1);
        });
        return { name: card.textContent.trim().slice(0, 12), words: words.length, rows, out };
      }),
    );
    assert(info.length >= 6, `poucos visuais na lista (${info.length})`);
    for (const t of info) {
      assert(t.words > 0, `${t.name}: miniatura sem texto`);
      assert(t.rows <= 3, `${t.name}: ${t.rows} linhas na miniatura (${vp.width}px) — letra quebrando palavra por palavra`);
      assert(!t.out, `${t.name}: texto estoura a miniatura (${vp.width}px)`);
    }
    await c.close();
  }
});

await step('espaço entre linhas: diminuir aproxima de verdade, até as linhas quase se tocarem', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'linhas');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Linhas');
  await pg.locator('dialog textarea').first().fill('Vem sobre mim\nSenhor');
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  await pg.getByRole('tab', { name: /^Texto$/ }).click();
  const gap = async (v) => {
    await pg.getByLabel('Espaço entre linhas (controle deslizante)').evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await pg.waitForTimeout(700);
    return pg.evaluate(() => {
      const ln = [...document.querySelectorAll('.surface .layer .ln')].filter((l) => l.textContent.trim()).map((l) => l.getBoundingClientRect());
      return ln[1].top - ln[0].top;
    });
  };
  const d125 = await gap(1.25);
  const d08 = await gap(0.8);
  const d05 = await gap(0.5);
  assert(d08 < d125 - 4, `0,8 deveria aproximar mais que 1,25 (${d08.toFixed(1)} vs ${d125.toFixed(1)}px)`);
  assert(d05 < d08 - 4, `0,5 deveria aproximar mais que 0,8 (${d05.toFixed(1)} vs ${d08.toFixed(1)}px)`);
  await pg.close();
});

await step('troca de cor (branco → verde): aparece branca, termina verde na tela e no vídeo exportado', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'cor');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Cor');
  await pg.locator('dialog textarea').first().fill('Aleluia');
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  await pg.getByRole('tab', { name: /^Animação$/ }).click();
  await pg.getByRole('combobox', { name: 'Predefinição de animação' }).click();
  await pg.getByRole('option', { name: 'Branco → verde' }).click();
  const colorOf = () =>
    pg.evaluate(() => {
      const w = document.querySelector('.surface [data-w]');
      return w ? getComputedStyle(w).color : null;
    });
  await pg.waitForTimeout(1300); // entrada (0,8 s) + um pouco da espera
  const early = await colorOf();
  assert(early === 'rgb(255, 255, 255)', `no começo deveria estar branca, está ${early}`);
  await pg.waitForFunction(() => {
    const w = document.querySelector('.surface [data-w]');
    return w && getComputedStyle(w).color === 'rgb(74, 222, 128)';
  }, null, { timeout: 8000 });
  // estado final nas miniaturas (tela estática)
  // vídeo: o último quadro é verde e o primeiro com texto é branco
  await pg.getByRole('button', { name: /Exportar vídeos/ }).click();
  await pg.getByRole('button', { name: /^Gerar 1 vídeo$/ }).click();
  await pg.getByRole('button', { name: /Baixar/ }).first().waitFor({ timeout: 240000 });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: /Baixar/ }).first().click()]);
  const dir = mkdtempSync(join(tmpdir(), 'cs-cor-'));
  const file = join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  let mp4 = file;
  if (/\.zip$/.test(file)) {
    spawnSync('unzip', ['-o', '-q', file, '-d', dir]);
    mp4 = join(dir, readdirSync(dir).find((f) => f.endsWith('.mp4')));
  }
  const frame = (args) => spawnSync('ffmpeg', ['-v', 'error', ...args, '-i', mp4, '-frames:v', '1', '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 }).stdout;
  const tally = (buf) => {
    let white = 0;
    let green = 0;
    for (let i = 0; i + 2 < buf.length; i += 3) {
      const [r, g, b] = [buf[i], buf[i + 1], buf[i + 2]];
      if (r > 225 && g > 225 && b > 225) white++;
      else if (g > 170 && r < 120 && b < 170) green++;
    }
    return { white, green };
  };
  const first = tally(frame(['-ss', '1.0'])); // entrada terminou, a cor ainda não começou a mudar muito
  const last = tally(frame(['-sseof', '-0.3']));
  assert(first.white > 80 && first.green < first.white * 0.2, `aos 1,0 s deveria estar branca: ${JSON.stringify(first)}`);
  assert(last.green > 80 && last.white < last.green * 0.2, `no fim deveria estar verde: ${JSON.stringify(last)}`);
  await pg.close();
});

await step('troca de cor só nas palavras marcadas: sequência vermelho → azul, começa no tempo escolhido, igual no telão', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'seleção');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Seleção de cor');
  await pg.locator('dialog textarea').first().fill('Vem sobre mim Senhor');
  await pg.locator('dialog').getByText('Simples', { exact: true }).click();
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  const pid = pg.url().split('/edit/')[1];
  await pg.waitForTimeout(1200);
  // marca só "Senhor" no slide
  const box = await pg.locator('.surface [data-w="3"]').boundingBox();
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pg.getByRole('tab', { name: /^Animação$/ }).click();
  await pg.getByText('1 palavra marcada').waitFor();
  await pg.getByRole('switch', { name: 'Trocar a cor das palavras marcadas' }).click();
  // sequência: vermelho → azul (pelo seletor de cor)
  const setHex = async (name, hex) => {
    await pg.getByRole('button', { name, exact: true }).click();
    const hexInput = pg.getByRole('textbox', { name: 'Cor em hexadecimal' });
    await hexInput.fill(hex);
    await pg.keyboard.press('Escape');
  };
  await setHex('Cor 1', '#ff0000');
  await pg.getByRole('button', { name: 'Adicionar cor à sequência' }).click();
  await setHex('Cor 2', '#0000ff');
  // adicionar e remover: uma 3ª cor entra e sai
  await pg.getByRole('button', { name: 'Adicionar cor à sequência' }).click();
  assert((await pg.getByRole('button', { name: 'Cor 3', exact: true }).count()) === 1, '3ª cor não foi adicionada');
  await pg.getByRole('button', { name: 'Cor 3', exact: true }).click();
  await pg.getByRole('button', { name: /Remover esta cor/ }).click();
  assert((await pg.getByRole('button', { name: 'Cor 3', exact: true }).count()) === 0, '3ª cor não foi removida');
  // começa 3 s depois de o trecho aparecer; troca em 1 s
  const start = pg.getByRole('textbox', { name: 'Começa em', exact: true });
  await start.fill('3');
  await start.press('Enter');
  const dur = pg.getByRole('textbox', { name: 'Tempo da troca', exact: true });
  await dur.fill('1');
  await dur.press('Enter');
  await pg.waitForTimeout(500);
  // mede no próprio navegador, quadro a quadro, a partir do "Ver de novo"
  const samples = await pg.evaluate(
    () =>
      new Promise((done) => {
        const out = [];
        const t0 = performance.now();
        [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ver de novo').click();
        const tick = () => {
          const frames = document.querySelectorAll('.surface .text-frame');
          const ws = frames.length ? [...frames[frames.length - 1].querySelectorAll('[data-w]')] : [];
          if (ws.length === 4) out.push({ t: performance.now() - t0, c: ws.map((w) => getComputedStyle(w).color) });
          if (performance.now() - t0 < 5200) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
  assert(samples.length > 50, `poucos quadros medidos (${samples.length})`);
  for (const s of samples) for (const k of [0, 1, 2]) assert(s.c[k] === 'rgb(255, 255, 255)', `palavra não marcada mudou de cor em ${s.t.toFixed(0)} ms: ${s.c[k]}`);
  const early = samples.filter((s) => s.t < 2800);
  assert(early.length && early.every((s) => s.c[3] === 'rgb(255, 255, 255)'), 'a troca começou antes dos 3 s');
  const red = samples.find((s) => {
    const [r, g, b] = rgb(s.c[3]);
    return r > 230 && g < 40 && b < 40;
  });
  const blueIdx = samples.findIndex((s) => s.c[3] === 'rgb(0, 0, 255)');
  assert(red, 'não passou pelo vermelho');
  assert(blueIdx >= 0, `não terminou no azul: ${samples[samples.length - 1].c[3]}`);
  assert(red.t < samples[blueIdx].t, 'a ordem da sequência não foi respeitada');
  assert(red.t > 3000 && samples[blueIdx].t < 4600, `tempos fora do esperado: vermelho ${red.t.toFixed(0)} ms, azul ${samples[blueIdx].t.toFixed(0)} ms`);

  // desmarcar: tirar a troca da palavra faz ela voltar à cor original na hora
  await pg.getByRole('switch', { name: 'Trocar a cor das palavras marcadas' }).click();
  await pg.waitForFunction(() => [...document.querySelectorAll('.surface .text-frame')].pop()?.querySelector('[data-w="3"]') && getComputedStyle([...document.querySelectorAll('.surface .text-frame')].pop().querySelector('[data-w="3"]')).color === 'rgb(255, 255, 255)', null, { timeout: 3000 });
  await pg.keyboard.press('Control+z');
  await pg.waitForTimeout(400);

  // telão: mesma regra (só "Senhor" muda e termina azul)
  const op2 = await ctx.newPage();
  watch(op2, 'operador-cor');
  await op2.goto(`${BASE}#/present/${pid}`);
  await op2.locator('.op-count').waitFor();
  const out2 = await ctx.newPage();
  watch(out2, 'telão-cor');
  await out2.goto(`${BASE}#/output`);
  await out2.waitForFunction(() => document.querySelectorAll('.out [data-w]').length === 4, null, { timeout: 8000 });
  await out2.waitForFunction(() => getComputedStyle(document.querySelector('.out [data-w="3"]')).color === 'rgb(0, 0, 255)', null, { timeout: 9000 });
  const outColors = await out2.evaluate(() => [...document.querySelectorAll('.out [data-w]')].map((w) => getComputedStyle(w).color));
  assert(outColors.slice(0, 3).every((c) => c === 'rgb(255, 255, 255)'), `no telão outras palavras mudaram: ${outColors}`);
  await out2.close();
  await op2.close();

  // vídeo exportado: no último quadro "Senhor" está azul e o resto continua branco
  await pg.getByRole('button', { name: /Exportar vídeos/ }).click();
  await pg.getByRole('button', { name: /^Gerar 1 vídeo$/ }).click();
  await pg.getByRole('button', { name: /Baixar/ }).first().waitFor({ timeout: 240000 });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: /Baixar/ }).first().click()]);
  const dir = mkdtempSync(join(tmpdir(), 'cs-sel-'));
  let file = join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  if (/\.zip$/.test(file)) {
    spawnSync('unzip', ['-o', '-q', file, '-d', dir]);
    file = join(dir, readdirSync(dir).find((f) => f.endsWith('.mp4')));
  }
  const last = spawnSync('ffmpeg', ['-v', 'error', '-sseof', '-0.3', '-i', file, '-frames:v', '1', '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 }).stdout;
  let white = 0;
  let blue = 0;
  for (let i = 0; i + 2 < last.length; i += 3) {
    const [r, g, b] = [last[i], last[i + 1], last[i + 2]];
    if (r > 225 && g > 225 && b > 225) white++;
    else if (b > 180 && r < 80 && g < 80) blue++;
  }
  assert(blue > 60, `no vídeo "Senhor" não ficou azul (${blue} px azuis)`);
  assert(white > 60, `no vídeo as palavras não marcadas deveriam continuar brancas (${white} px brancos)`);
  await pg.close();
});

await step('legibilidade: frases curtas, médias e longas nunca abaixo da letra mínima nem fora do slide', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'legibilidade');
  const cases = [
    ['Impacto', 'Pai\nTu és bom, tu és fiel e o teu amor não tem fim'],
    ['Impacto', 'Eu me rendo ao teu amor, eu me rendo ao teu querer, eu me prostro aos teus pés'],
    ['Impacto', 'Santo'],
    ['Simples', 'Porque Ele vive posso crer no amanhã, porque Ele vive temor não há, mas eu bem sei, eu sei que a minha vida está nas mãos do meu Jesus que vivo está'],
  ];
  for (const [vp, label] of [[{ width: 1600, height: 900 }, '1600×900'], [{ width: 1280, height: 720 }, '1280×720']]) {
    await pg.setViewportSize(vp);
    for (const [theme, text] of cases) {
      await pg.goto(BASE);
      await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
      await pg.locator('dialog input').first().fill('Legível');
      await pg.locator('dialog textarea').first().fill(text);
      await pg.locator('dialog').getByText(theme, { exact: true }).click();
      await pg.getByRole('button', { name: /Criar e abrir/i }).click();
      await pg.waitForURL(/#\/edit\//);
      await pg.waitForTimeout(1600);
      const r = await pg.evaluate(() => {
        const st = document.querySelector('.surface .stage').getBoundingClientRect();
        let min = Infinity;
        const fora = [];
        document.querySelectorAll('.surface .stage [data-w]').forEach((w) => {
          min = Math.min(min, parseFloat(getComputedStyle(w).fontSize));
          const q = w.getBoundingClientRect();
          if (q.left < st.left - 1 || q.right > st.right + 1 || q.top < st.top - 1 || q.bottom > st.bottom + 1) fora.push(w.textContent);
        });
        return { pct: (min / st.height) * 100, fora };
      });
      assert(r.pct >= 4.45, `${label} "${text.slice(0, 24)}…": letra de ${r.pct.toFixed(2)}% da altura`);
      assert(!r.fora.length, `${label} "${text.slice(0, 24)}…": fora do slide: ${r.fora.join(' ')}`);
    }
  }
  await pg.close();
});

await step('proporção automática (Impacto): linhas com mais palavras ficam menores e terminam no mesmo comprimento da palavra grande', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'proporção');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Proporção');
  await pg.locator('dialog textarea').first().fill('Grande é o Senhor e muito digno de louvor\nNa cidade do nosso Deus\n\nEu te louvo, Senhor, com todo o meu coração');
  await pg.locator('dialog').getByText('Impacto', { exact: true }).click();
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  const lines = () =>
    pg.evaluate(() => {
      const layer = document.querySelector('.surface .layer');
      const stageH = document.querySelector('.surface .stage').getBoundingClientRect().height;
      return {
        block: layer.clientWidth,
        stageH,
        ls: [...layer.querySelectorAll('.ln')]
          .filter((l) => l.textContent.trim())
          .map((l) => {
            const r = document.createRange();
            r.selectNodeContents(l);
            return { t: l.textContent.trim(), w: r.getBoundingClientRect().width, fs: parseFloat(getComputedStyle(l).fontSize), wrap: l.dataset.wrap === '1' };
          }),
      };
    });
  for (const slide of [0, 1]) {
    await pg.getByRole('list', { name: 'Trechos do louvor' }).locator('li').nth(slide).click();
    await pg.waitForTimeout(1800);
    const { block, stageH, ls } = await lines();
    const big = ls.reduce((a, b) => (b.fs > a.fs ? b : a));
    // comprimento-alvo: o da palavra grande, ou 36% da caixa se ela for curta demais (legibilidade)
    const target = Math.max(big.w, block * 0.36);
    assert(ls.length >= 2, `trecho ${slide + 1}: esperava várias linhas`);
    for (const l of ls) {
      // linhas curtas só crescem até ~60% da palavra grande; linhas que quebraram por legibilidade não igualam
      if (l !== big && l.fs < big.fs * 0.6 && !l.wrap) assert(Math.abs(l.w - target) / target < 0.04, `trecho ${slide + 1}: "${l.t}" tem ${l.w.toFixed(0)}px e o alvo é ${target.toFixed(0)}px`);
      if (l !== big) assert(l.fs < big.fs * 0.7, `trecho ${slide + 1}: "${l.t}" deveria ser bem menor que a palavra grande`);
      assert(l.fs >= stageH * 0.045 - 0.5, `trecho ${slide + 1}: "${l.t}" ficou abaixo da letra mínima (${((l.fs / stageH) * 100).toFixed(2)}% da altura)`);
    }
  }
  await pg.close();
});

await step('tema claro/escuro: botão troca, preferência fica salva e nada fica com a cor do outro tema', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'tema');
  await pg.goto(BASE);
  // ponto de partida conhecido
  await pg.evaluate(() => localStorage.setItem('cs:theme', JSON.stringify('light')));
  await pg.reload();
  const theme = () => pg.evaluate(() => document.documentElement.dataset.theme);
  assert((await theme()) === 'light', 'não começou claro');
  await pg.getByRole('button', { name: 'Usar tema escuro' }).click();
  assert((await theme()) === 'dark', 'botão não trocou para escuro');
  await pg.reload();
  assert((await theme()) === 'dark', 'a preferência não sobreviveu ao recarregar');

  // varre a tela: em tema escuro nenhum fundo claro sobra (fora do slide e das amostras de cor), e vice-versa
  const leftovers = (dark) =>
    pg.evaluate((dark) => {
      const lum = (c) => {
        const m = c.match(/[\d.]+/g);
        if (!m) return null;
        // color-mix() volta como "color(srgb r g b / a)" com canais de 0 a 1
        const unit = c.startsWith('color(') ? 255 : 1;
        const [r, g, b] = m.slice(0, 3).map((x) => Number(x) * unit);
        const a = m.length > 3 ? Number(m[3]) : 1;
        if (a < 0.6) return null;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        // o slide e as miniaturas (fundo preto atrás do slide) são sempre escuros, em qualquer tema
        if (el.closest('.stage, .thumb, [class*="thumb"], .swatch, .color-swatch, .cp, .cfx-path, .cp-now, svg, .sel-wrap')) continue; // alças ficam sobre o slide (sempre claras, como no Canva)
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        const L = lum(getComputedStyle(el).backgroundColor);
        if (L === null) continue;
        if (dark ? L > 0.75 : L < 0.08) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      }
      return [...new Set(bad)].slice(0, 6);
    }, dark);
  const tour = async (dark) => {
    const where = [];
    let b = await leftovers(dark);
    if (b.length) where.push(`biblioteca: ${b}`);
    await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
    b = await leftovers(dark);
    if (b.length) where.push(`novo louvor: ${b}`);
    await pg.locator('dialog textarea').first().fill('Vem sobre mim Senhor');
    await pg.getByRole('button', { name: /Criar e abrir/i }).click();
    await pg.waitForURL(/#\/edit\//);
    await pg.waitForTimeout(800);
    for (const tab of ['Texto', 'Palavras', 'Fundo', 'Animação']) {
      await pg.getByRole('tab', { name: tab, exact: true }).click();
      b = await leftovers(dark);
      if (b.length) where.push(`editor/${tab}: ${b}`);
    }
    const box = await pg.locator('.surface [data-w="0"]').boundingBox();
    await pg.mouse.click(box.x + 5, box.y + 5, { button: 'right' });
    b = await leftovers(dark);
    if (b.length) where.push(`menu: ${b}`);
    await pg.keyboard.press('Escape');
    await pg.getByRole('button', { name: /Exportar vídeos/ }).click();
    b = await leftovers(dark);
    if (b.length) where.push(`exportar: ${b}`);
    await pg.keyboard.press('Escape');
    const id = pg.url().split('/edit/')[1];
    await pg.goto(`${BASE}#/present/${id}`);
    await pg.locator('.op-count').waitFor();
    b = await leftovers(dark);
    if (b.length) where.push(`operador: ${b}`);
    await pg.goto(BASE);
    return where;
  };
  const darkBad = await tour(true);
  assert(!darkBad.length, `fundos claros no tema escuro: ${darkBad.join(' | ')}`);
  await pg.getByRole('button', { name: 'Usar tema claro' }).click();
  assert((await theme()) === 'light', 'não voltou para o claro');
  await pg.waitForFunction(() => !document.documentElement.classList.contains('theme-switching'));
  await pg.waitForTimeout(600); // fim da transição suave
  const lightBad = await tour(false);
  assert(!lightBad.length, `fundos escuros no tema claro: ${lightBad.join(' | ')}`);
  // outra janela aberta acompanha a troca
  const other = await ctx.newPage();
  await other.goto(BASE);
  await pg.getByRole('button', { name: 'Usar tema escuro' }).click();
  await other.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 3000 });
  await other.close();
  await pg.getByRole('button', { name: 'Usar tema claro' }).click();
  await pg.close();
});

await step('apoio via Pix: convite opcional depois de gerar, QR lido como o código Pix certo, "Agora não" some', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'apoio');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pg.goto(BASE);
  await pg.evaluate(() => localStorage.removeItem('cs:support-snooze-until'));
  // botão fixo na biblioteca
  await pg.getByRole('button', { name: 'Apoiar o projeto' }).click();
  const qr = pg.locator('dialog[open] .pix-qr');
  await qr.waitFor();
  const png = join(mkdtempSync(join(tmpdir(), 'cs-pix-')), 'qr.png');
  await pg.waitForTimeout(400); // fim da animação de abertura do diálogo
  await qr.screenshot({ path: png, scale: 'device' });
  const dec = spawnSync('python3', ['-c', 'import cv2,sys; i=cv2.imread(sys.argv[1]); i=cv2.resize(i,None,fx=4,fy=4,interpolation=cv2.INTER_NEAREST); i=cv2.copyMakeBorder(i,40,40,40,40,cv2.BORDER_CONSTANT,value=(255,255,255)); print(cv2.QRCodeDetector().detectAndDecode(i)[0])', png], { encoding: 'utf8' });
  const expected = /PIX_CODE =\s*'([^']+)'/.exec(readFileSync(new URL('../src/core/support.ts', import.meta.url), 'utf8'))[1];
  const code = dec.stdout.trim();
  assert(code.startsWith('000201') && code.includes('BR.GOV.BCB.PIX'), `QR não é um Pix: "${code.slice(0, 40)}"`);
  assert(code === expected, 'QR diferente do código Pix');
  await pg.getByRole('button', { name: 'Copiar código Pix' }).click();
  await pg.getByRole('button', { name: 'Código copiado' }).waitFor();
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  assert(clip === code, 'o código copiado não é o mesmo do QR');
  await pg.keyboard.press('Escape');

  // depois de gerar os vídeos: convite aparece, não bloqueia o download, e "Agora não" esconde nas próximas vezes
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog textarea').first().fill('Aleluia');
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  const gen = async () => {
    await pg.getByRole('button', { name: /Exportar vídeos/ }).click();
    await pg.getByRole('button', { name: /^Gerar 1 vídeo$/ }).click();
    await pg.getByRole('button', { name: /Baixar tudo/ }).waitFor({ timeout: 240000 });
  };
  await gen();
  assert(await pg.locator('dialog[open] .support').isVisible(), 'convite não apareceu depois de gerar');
  assert(await pg.getByRole('button', { name: /Baixar tudo/ }).isEnabled(), 'download não pode depender do apoio');
  await pg.getByRole('button', { name: 'Agora não' }).click();
  assert(!(await pg.locator('dialog[open] .support').count()), '"Agora não" não escondeu');
  await pg.keyboard.press('Escape');
  await gen();
  assert(!(await pg.locator('dialog[open] .support').count()), 'convite voltou logo depois de "Agora não"');
  await pg.keyboard.press('Escape');
  await pg.close();
});

await step('menus suspensos: teclado, escolha dentro de diálogo (por cima e clicável), Esc fecha só o menu', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'menus');
  await pg.goto(BASE);
  const sort = pg.getByRole('combobox', { name: 'Ordenar' });
  await sort.focus();
  await pg.keyboard.press('ArrowDown');
  await pg.getByRole('listbox', { name: 'Ordenar' }).waitFor();
  await pg.keyboard.press('End');
  const last = await pg.getByRole('option').last().textContent();
  await pg.keyboard.press('Enter');
  assert((await sort.textContent()).includes(last), `não escolheu a última opção (${last})`);
  // dentro de um diálogo
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog textarea').first().fill('linha um\nlinha dois\nlinha três\n\nlinha quatro');
  const mode = pg.getByRole('combobox', { name: 'Como dividir a letra' });
  await mode.click();
  // a lista precisa aparecer POR CIMA do diálogo (antes ela abria atrás dele e não dava para escolher)
  const opt = pg.getByRole('option', { name: /linha/i }).first();
  await opt.waitFor();
  const onTop = await opt.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  assert(onTop, 'a lista de opções ficou escondida atrás do diálogo');
  const before = await pg.locator('.np-count').textContent();
  await opt.click();
  assert(/linha/i.test(await mode.textContent()), `não escolheu "por linha": ${await mode.textContent()}`);
  assert((await pg.locator('.np-count').textContent()) !== before, 'a contagem de trechos não mudou');
  await mode.click();
  await pg.getByRole('listbox').waitFor();
  await pg.keyboard.press('Escape');
  assert(!(await pg.getByRole('listbox').count()), 'Esc não fechou o menu');
  assert(await pg.locator('dialog[open]').count(), 'Esc fechou o diálogo junto');
  await pg.keyboard.press('Escape');
  await pg.close();
});

await step('alças da caixa (estilo Canva): canto aumenta/diminui, lateral muda a largura, botão gira, desfazer volta', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'alças');
  await pg.setViewportSize({ width: 1366, height: 768 });
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog textarea').first().fill('Vem sobre mim Senhor');
  await pg.locator('dialog').getByText('Simples', { exact: true }).click();
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  await pg.locator('.grip-se').waitFor();
  const style = () => pg.evaluate(() => { const l = document.querySelector('.surface [data-layer]'); return { fs: parseFloat(getComputedStyle(l).fontSize), w: l.offsetWidth, t: l.style.transform }; });
  const s0 = await style();
  // canto: puxa para fora → letra maior
  let g = await pg.locator('.grip-se').boundingBox();
  await pg.mouse.move(g.x + 6, g.y + 6);
  await pg.mouse.down();
  await pg.mouse.move(g.x + 60, g.y + 30, { steps: 6 });
  await pg.mouse.up();
  const s1 = await style();
  assert(s1.fs > s0.fs * 1.05, `canto não aumentou a letra (${s0.fs} → ${s1.fs})`);
  // lateral: puxa para dentro → caixa mais estreita, letra igual
  g = await pg.locator('.grip-e').boundingBox();
  await pg.mouse.move(g.x + 3, g.y + 10);
  await pg.mouse.down();
  await pg.mouse.move(g.x - 120, g.y + 10, { steps: 6 });
  await pg.mouse.up();
  const s2 = await style();
  assert(s2.w < s1.w - 50, `lateral não estreitou a caixa (${s1.w} → ${s2.w})`);
  assert(Math.abs(s2.fs - s1.fs) < 0.5, 'lateral não deveria mudar o tamanho da letra');
  // girar: arrasta o botão de baixo para o lado → ângulo diferente de 0
  const sel = await pg.locator('.sel').boundingBox();
  const c = { x: sel.x + sel.width / 2, y: sel.y + sel.height / 2 };
  g = await pg.locator('.grip-rot').boundingBox();
  await pg.mouse.move(g.x + 14, g.y + 14);
  await pg.mouse.down();
  const r = Math.hypot(g.x + 14 - c.x, g.y + 14 - c.y);
  const a = Math.PI / 2 + (30 * Math.PI) / 180;
  await pg.mouse.move(c.x + r * Math.cos(a), c.y + r * Math.sin(a), { steps: 10 });
  await pg.mouse.up();
  const s3 = await style();
  const deg = Number(/rotate\((-?[\d.]+)deg\)/.exec(s3.t)?.[1]);
  assert(deg > 25 && deg < 35, `giro esperado ~30°, veio ${s3.t}`);
  // clique duplo volta a 0° (depois de uma pausa: gestos seguidos viram um único passo de desfazer)
  await pg.waitForTimeout(900);
  await pg.getByRole('button', { name: /Girar o texto/ }).dblclick();
  assert(!(await style()).t.includes('rotate'), 'clique duplo não voltou a 0°');
  // desfazer volta o giro
  await pg.keyboard.press('Control+z');
  await pg.waitForTimeout(200);
  assert((await style()).t.includes('rotate'), 'desfazer não trouxe o giro de volta');
  await pg.close();
});

await step('ímã na borda: o texto encosta e gruda na borda do slide; continuar arrastando para fora solta', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'ímã');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Ímã');
  await pg.locator('dialog textarea').first().fill('Santo');
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  const surf = pg.locator('.surface').first();
  await pg.locator('.surface [data-w]').first().waitFor();
  const s = await surf.boundingBox();
  // estreita a caixa para caber folga até a borda
  await pg.getByRole('tab', { name: /^Texto$/ }).click();
  const word = await pg.locator('.surface [data-w]').first().boundingBox();
  await pg.mouse.click(word.x + word.width / 2, word.y + word.height / 2);
  const sel = pg.locator('.sel').first();
  await sel.waitFor();
  const drag = async (dx) => {
    const b = await pg.locator('.surface [data-w]').first().boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await pg.mouse.move(x, y);
    await pg.mouse.down();
    await pg.mouse.move(x + dx, y, { steps: 12 });
    const hot = await pg.locator('.g-edge-l').count();
    await pg.mouse.up();
    await pg.waitForTimeout(250);
    return hot;
  };
  const b0 = await sel.boundingBox();
  // leva a borda esquerda da caixa para 5 px da borda do slide: tem de grudar em 0
  const hot = await drag(s.x + 5 - b0.x);
  let b1 = await sel.boundingBox();
  assert(hot === 1, 'a borda esquerda deveria acender durante o encaixe');
  assert(Math.abs(b1.x - s.x) <= 1.5, `a caixa deveria encostar na borda (diferença ${(b1.x - s.x).toFixed(1)} px)`);
  // continua para fora: solta e segue o mouse
  await drag(-40);
  b1 = await sel.boundingBox();
  assert(b1.x < s.x - 25, `continuando para fora, a caixa deveria passar da borda (${(b1.x - s.x).toFixed(1)} px)`);
  await pg.close();
});

await step('ímã: margem segura gruda; o botão "Ímã" desligado deixa o movimento livre (sem borda nem centro)', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'ímã 2');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Ímã 2');
  await pg.locator('dialog textarea').first().fill('Santo');
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  await pg.locator('.surface [data-w]').first().waitFor();
  const s = await pg.locator('.surface').first().boundingBox();
  const w0 = await pg.locator('.surface [data-w]').first().boundingBox();
  await pg.mouse.click(w0.x + w0.width / 2, w0.y + w0.height / 2);
  const sel = pg.locator('.sel').first();
  await sel.waitFor();
  const dragTo = async (targetTop) => {
    const b = await sel.boundingBox();
    const w = await pg.locator('.surface [data-w]').first().boundingBox();
    const x = w.x + w.width / 2;
    const y = w.y + w.height / 2;
    await pg.mouse.move(x, y);
    await pg.mouse.down();
    await pg.mouse.move(x, y + (targetTop - b.y), { steps: 12 });
    const safeHot = await pg.locator('.g-safe[data-hot="1"]').count();
    const edgeHot = await pg.locator('.g-edge-t').count();
    await pg.mouse.up();
    await pg.waitForTimeout(250);
    return { safeHot, edgeHot, top: (await sel.boundingBox()).y };
  };
  // margem segura (5% da altura): chegando a 4 px dela, gruda nela
  const safeY = s.y + s.height * 0.05;
  let r = await dragTo(safeY + 4);
  assert(r.safeHot === 1 && Math.abs(r.top - safeY) <= 1.5, `deveria grudar na margem segura (topo ${r.top.toFixed(1)} × ${safeY.toFixed(1)})`);
  // borda de cima
  r = await dragTo(s.y + 4);
  assert(r.edgeHot === 1 && Math.abs(r.top - s.y) <= 1.5, `deveria grudar na borda de cima (${(r.top - s.y).toFixed(1)} px)`);
  // desliga o ímã: o mesmo movimento para perto da borda não gruda
  await pg.getByRole('switch', { name: /Alinhamento magnético/ }).click();
  r = await dragTo(s.y + 6);
  assert(r.edgeHot === 0 && Math.abs(r.top - (s.y + 6)) <= 1.5, `com o ímã desligado o texto deveria parar onde soltei (${(r.top - s.y).toFixed(1)} px)`);
  const wc = await pg.locator('.surface [data-w]').first().boundingBox();
  // centro também desligado: perto do centro não puxa
  const b = await sel.boundingBox();
  const cxNow = b.x + b.width / 2;
  const targetCx = s.x + s.width / 2 + 5;
  await pg.mouse.move(wc.x + wc.width / 2, wc.y + wc.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(wc.x + wc.width / 2 + (targetCx - cxNow), wc.y + wc.height / 2, { steps: 10 });
  await pg.mouse.up();
  await pg.waitForTimeout(250);
  const b2 = await sel.boundingBox();
  assert(Math.abs(b2.x + b2.width / 2 - targetCx) <= 1.5, 'com o ímã desligado o centro não deveria puxar');
  // a preferência vale também para o Estúdio e fica salva
  assert((await pg.evaluate(() => localStorage.getItem('cs:snap-enabled'))) === 'false', 'a escolha do ímã fica salva');
  await pg.getByRole('switch', { name: /Alinhamento magnético/ }).click();
  await pg.close();
});

await step('seleção múltipla no editor (Ctrl + clique): arrastar move os dois textos juntos e o estilo vale para ambos', async () => {
  const pg = await ctx.newPage();
  watch(pg, 'multi');
  await pg.goto(BASE);
  await pg.getByRole('button', { name: /Novo louvor/i }).first().click();
  await pg.locator('dialog input').first().fill('Multi');
  await pg.locator('dialog textarea').first().fill('Santo');
  await pg.getByRole('button', { name: /Criar e abrir/i }).click();
  await pg.waitForURL(/#\/edit\//);
  const pid = pg.url().split('/edit/')[1];
  await pg.getByRole('tab', { name: /Elementos/ }).click();
  await pg.getByRole('button', { name: /Texto livre/ }).click();
  const words = pg.locator('.surface .layer');
  await pg.waitForFunction(() => document.querySelectorAll('.surface .layer').length === 2);
  const a = await pg.locator('.surface [data-w]', { hasText: 'Santo' }).first().boundingBox();
  const bTxt = await pg.locator('.surface [data-w]', { hasText: 'Novo' }).first().boundingBox();
  // "Santo" pela ponta esquerda (o texto livre nasce no meio, por cima dele)
  await pg.mouse.click(a.x + 12, a.y + a.height / 2);
  await pg.keyboard.down('Control');
  await pg.mouse.click(bTxt.x + bTxt.width / 2, bTxt.y + bTxt.height / 2);
  await pg.keyboard.up('Control');
  await pg.locator('.sel-count', { hasText: '2 textos selecionados' }).waitFor();
  // arrasta o grupo pela primeira palavra
  const a2 = await pg.locator('.surface [data-w]', { hasText: 'Santo' }).first().boundingBox();
  const s0 = await pg.locator('.surface').first().boundingBox();
  const pos0 = await pg.evaluate(() => {
    const ls = [...document.querySelectorAll('.surface .layer')];
    const pick = (i) => ({ x: parseFloat(ls[i].style.left), y: parseFloat(ls[i].style.top) });
    return { lyr: pick(0), free: pick(1) };
  });
  await pg.mouse.move(a2.x + 12, a2.y + a2.height / 2);
  await pg.keyboard.down('Alt'); // sem ímã: aqui o que importa é andar junto
  await pg.mouse.down();
  await pg.mouse.move(a2.x + 12 + 60, a2.y + a2.height / 2 + 30, { steps: 8 });
  await pg.mouse.up();
  await pg.keyboard.up('Alt');
  await pg.waitForTimeout(1200); // salvamento automático
  // o texto da letra se reajusta perto da borda, então conferimos a posição salva de cada camada
  const pos = await pg.evaluate(
    (id) =>
      new Promise((res) => {
        const r = indexedDB.open('church-slide');
        r.onsuccess = () => {
          const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(id);
          g.onsuccess = () => res(g.result.slides[0].layers.map((l) => ({ role: l.role, x: l.style.x, y: l.style.y })));
        };
      }),
    pid,
  );
  const lyr = pos.find((l) => l.role === 'lyrics');
  const free = pos.find((l) => l.role === 'free');
  const dx = (60 / s0.width) * 100;
  const dy = (30 / s0.height) * 100;
  assert(Math.abs(lyr.x - pos0.lyr.x - dx) < 0.3 && Math.abs(free.x - pos0.free.x - dx) < 0.3, `os dois deveriam andar ${dx.toFixed(1)}% (${(lyr.x - pos0.lyr.x).toFixed(1)} / ${(free.x - pos0.free.x).toFixed(1)})`);
  assert(Math.abs(lyr.y - pos0.lyr.y - dy) < 0.3 && Math.abs(free.y - pos0.free.y - dy) < 0.3, 'o segundo texto também desce junto');
  // estilo em lote: liga "Inverter cores" com os dois selecionados
  await pg.getByRole('tab', { name: /^Texto$/ }).click();
  await pg.getByText('2 textos selecionados.').waitFor();
  await pg.getByRole('switch', { name: 'Ativar Inverter cores' }).click();
  await pg.waitForTimeout(300);
  const blends = await words.evaluateAll((els) => els.map((e) => getComputedStyle(e).mixBlendMode));
  assert(blends.length === 2 && blends.every((b) => b === 'difference'), `os dois textos deveriam inverter cores (${blends.join(', ')})`);
  await pg.close();
});

/* ------------------------------ Estúdio de Fundos ------------------------------ */

/** Lê um registro direto do IndexedDB do app (o que ficou salvo de verdade). */
const idbGet = (pg, store, id) =>
  pg.evaluate(
    ({ store, id }) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('church-slide');
        r.onsuccess = () => {
          const g = r.result.transaction(store, 'readonly').objectStore(store).get(id);
          g.onsuccess = () => {
            res(g.result ?? null);
            r.result.close();
          };
          g.onerror = () => rej(g.error);
        };
        r.onerror = () => rej(r.error);
      }),
    { store, id },
  );
/** Repete a leitura até bater (a interface atualiza alguns campos depois do quadro). */
const settle = async (read, ok, ms = 3000) => {
  const t0 = Date.now();
  let v = await read();
  while (!ok(v) && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 80));
    v = await read();
  }
  return v;
};
const waitSaved = (pg) => pg.locator('.studio-status[data-state="saved"]').waitFor({ timeout: 5000 });
let designId = '';
let st = null;

await step('Estúdio de Fundos: item na barra lateral, modelo abre o estúdio, mover no palco, desfazer e salvar sozinho', async () => {
  st = await ctx.newPage();
  watch(st, 'estúdio');
  await st.goto(BASE);
  await st.getByRole('button', { name: /^Fundos/ }).first().click();
  await st.waitForURL(/#\/fundos$/);
  await st.getByRole('heading', { name: 'Comece por um modelo' }).waitFor();
  await st.getByRole('button', { name: /Sol poente/ }).click();
  await st.waitForURL(/#\/fundos\/bg/);
  designId = decodeURIComponent(st.url().split('/fundos/')[1]);
  await st.locator('.st-surface canvas').waitFor();
  await st.waitForTimeout(400);
  const lum = await st.evaluate(() => {
    const c = document.querySelector('.st-surface canvas');
    const d = c.getContext('2d').getImageData((c.width / 2) | 0, (c.height / 2) | 0, 1, 1).data;
    return d[0] + d[1] + d[2];
  });
  assert(lum > 150, `o palco deveria mostrar o sol no centro (soma RGB ${lum})`);
  assert((await st.locator('.dl-row').count()) === 5, 'o modelo "Sol poente" tem 5 camadas');

  const box = await st.locator('.st-surface').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await st.mouse.click(cx, cy);
  assert((await st.locator('.insp-name').inputValue()) === 'Sol', 'clicar no sol seleciona a camada "Sol"');
  await st.mouse.move(cx, cy);
  await st.mouse.down();
  await st.mouse.move(cx + box.width * 0.1, cy, { steps: 6 });
  await st.mouse.up();
  const hx = () => st.getByLabel('Horizontal', { exact: true }).inputValue().then(Number);
  const x1 = await settle(hx, (v) => Math.abs(v - 60) < 1.5);
  assert(Math.abs(x1 - 60) < 1.5, `arrastar 10% da largura deveria levar o sol a ~60% (veio ${x1})`);
  await st.keyboard.press('Control+z');
  const x0 = await settle(hx, (v) => v === 50);
  // ímã no estúdio: o sol (54% da altura) encosta na borda esquerda quando chega perto
  const sunHalf = (0.54 * box.height) / 2;
  await st.mouse.move(cx, cy);
  await st.mouse.down();
  await st.mouse.move(box.x + sunHalf + 6, cy, { steps: 10 });
  const edgeHot = await st.locator('.st-surface .g-edge-l').count();
  await st.mouse.up();
  const xs = await settle(hx, (v) => Math.abs(v - (sunHalf / box.width) * 100) < 0.3);
  assert(edgeHot === 1 && Math.abs(xs - (sunHalf / box.width) * 100) < 0.3, `o sol deveria grudar na borda (x=${xs})`);
  await st.keyboard.press('Control+z');
  await settle(hx, (v) => v === 50);
  assert(x0 === 50, `desfazer volta para 50% num passo só (veio ${x0})`);

  await st.locator('.tb-name').fill('Meu sol');
  await waitSaved(st);
  await st.reload();
  await st.locator('.st-surface canvas').waitFor();
  assert((await st.locator('.tb-name').inputValue()) === 'Meu sol', 'o nome sobrevive ao recarregar');
  assert((await st.locator('.dl-row').count()) === 5, 'as camadas sobrevivem ao recarregar');
  const rec = await idbGet(st, 'designs', designId);
  assert(rec && rec.layers.find((l) => l.name === 'Sol').x === 50, 'o banco guardou o sol no lugar desfeito');
});

await step('Estúdio: camada nova, recorte, cores e movimento (ciclo de cores) pelo painel', async () => {
  await st.getByRole('button', { name: 'Adicionar camada' }).click();
  await st.getByRole('menuitem', { name: /Partículas/ }).click();
  assert((await st.locator('.dl-row').count()) === 6, 'a camada nova entra na lista');
  assert((await st.locator('.insp-name').inputValue()) === 'Partículas', 'a camada nova fica selecionada');
  await st.getByRole('button', { name: /Adicionar movimento/ }).click();
  await st.getByRole('menuitem', { name: /Ciclo de cores/ }).click();
  await st.locator('.motion', { hasText: 'Ciclo de cores' }).waitFor();
  await st.keyboard.press('Delete');
  assert((await st.locator('.dl-row').count()) === 5, 'Delete remove a camada selecionada');
  await waitSaved(st);

  // Ctrl + clique na lista: "Sol" + "Brilho"; a opacidade e o "inverter cores" valem para os dois
  await st.getByRole('button', { name: 'Sol', exact: true }).click();
  await st.keyboard.down('Control');
  await st.getByRole('button', { name: 'Brilho', exact: true }).click();
  await st.keyboard.up('Control');
  await st.getByText('2 camadas selecionadas.').waitFor();
  const op = st.getByLabel('Opacidade', { exact: true });
  await op.fill('40');
  await op.press('Enter');
  await st.locator('.studio-props').getByRole('combobox', { name: 'Modo de mistura' }).click();
  await st.getByRole('option', { name: /Inverter cores/ }).click();
  await waitSaved(st);
  const rec = await idbGet(st, 'designs', designId);
  const both = rec.layers.filter((l) => l.name === 'Sol' || l.name === 'Brilho');
  assert(both.length === 2 && both.every((l) => l.opacity === 40 && l.blend === 'difference'), `ajuste em lote: ${JSON.stringify(both.map((l) => [l.name, l.opacity, l.blend]))}`);
  // arrastar no palco move o grupo
  const xs0 = Object.fromEntries(both.map((l) => [l.name, l.x]));
  const box = await st.locator('.st-surface').boundingBox();
  await st.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await st.keyboard.down('Alt');
  await st.mouse.down();
  await st.mouse.move(box.x + box.width / 2 + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
  await st.mouse.up();
  await st.keyboard.up('Alt');
  await waitSaved(st);
  const rec2 = await idbGet(st, 'designs', designId);
  for (const l of rec2.layers.filter((q) => q.name === 'Sol' || q.name === 'Brilho')) {
    assert(Math.abs(l.x - xs0[l.name] - 20) < 0.6, `${l.name} deveria andar 20% junto (andou ${(l.x - xs0[l.name]).toFixed(2)})`);
  }
  // desfaz tudo (arraste, mistura, opacidade) para as próximas etapas
  for (let i = 0; i < 3; i++) await st.keyboard.press('Control+z');
  await st.keyboard.press('Escape');
  await waitSaved(st);
  const rec3 = await idbGet(st, 'designs', designId);
  assert(rec3.layers.find((l) => l.name === 'Sol').x === 50 && rec3.layers.find((l) => l.name === 'Sol').opacity === 100, 'desfazer volta o grupo');
});

await step('Fundo em vídeo (só o fundo): MP4 de 12 s que repete sem emenda', async () => {
  await st.goto(BASE + '#/fundos');
  await st.getByRole('button', { name: 'Mais ações para Meu sol' }).click();
  await st.getByRole('menuitem', { name: /Exportar vídeo/ }).click();
  await st.locator('dialog').getByRole('radio', { name: '720p' }).click();
  await st.locator('dialog').getByRole('button', { name: 'Gerar vídeo' }).click();
  await st.locator('dialog').getByRole('button', { name: 'Baixar vídeo' }).waitFor({ timeout: 180000 });
  const [dl] = await Promise.all([st.waitForEvent('download'), st.locator('dialog').getByRole('button', { name: 'Baixar vídeo' }).click()]);
  assert(/Meu sol \(loop 12s\)\.mp4$/.test(dl.suggestedFilename()), `nome: ${dl.suggestedFilename()}`);
  const dir = mkdtempSync(join(tmpdir(), 'cs-loop-'));
  const f = join(dir, 'loop.mp4');
  await dl.saveAs(f);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames', '-of', 'json', f], { encoding: 'utf8' });
  if (probe.status !== 0) return console.log('      (ffprobe ausente: conferi só o download)');
  const s = JSON.parse(probe.stdout).streams[0];
  assert(s.codec_name === 'h264' && s.width === 1280 && s.height === 720, `vídeo inesperado: ${JSON.stringify(s)}`);
  assert(Number(s.nb_read_frames) === 360, `12 s × 30 qps = 360 quadros (veio ${s.nb_read_frames})`);
  // emenda: do último quadro para o primeiro a mudança é do tamanho de qualquer outra virada de bloco do codificador
  // (a cada 2 s entra um quadro-chave; a volta 359 → 0 é uma virada dessas)
  const grab = (n, out) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `select=eq(n\\,${n})`, '-vframes', '1', join(dir, out)]);
  grab(0, 'a.png');
  grab(59, 'g1.png');
  grab(60, 'g2.png');
  grab(359, 'z.png');
  const psnr = (a, b) => {
    const r = spawnSync('ffmpeg', ['-i', join(dir, a), '-i', join(dir, b), '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /average:([\d.]+|inf)/.exec(r.stderr);
    return m ? (m[1] === 'inf' ? 99 : parseFloat(m[1])) : NaN;
  };
  const gop = psnr('g1.png', 'g2.png');
  const seam = psnr('z.png', 'a.png');
  assert(seam >= gop - 4, `emenda visível: último→primeiro ${seam.toFixed(1)} dB, virada normal de bloco ${gop.toFixed(1)} dB`);
  await st.keyboard.press('Escape');
});

await step('Usar num louvor: o louvor guarda uma CÓPIA; mudar "Meus fundos" não altera o louvor até pedir "Atualizar"', async () => {
  await st.goto(BASE + '#/fundos'); // recarrega: nenhum diálogo de etapa anterior fica aberto
  await st.getByRole('button', { name: 'Mais ações para Meu sol' }).click();
  await st.getByRole('menuitem', { name: /Usar num louvor/ }).click();
  await st.locator('dialog .apply-item').filter({ has: st.locator('b', { hasText: /^Grande é o Senhor$/ }) }).first().click();
  await st.waitForURL(new RegExp(`#/edit/${projectId}`));
  await st.locator('.surface .bg canvas').first().waitFor();
  let p = await idbGet(st, 'projects', projectId);
  assert(p.theme.background.kind === 'design' && p.theme.background.design.name === 'Meu sol', 'o fundo virou o fundo do louvor');
  assert(p.slides.every((s) => !s.background), 'vale para todos os trechos');

  // muda o original no estúdio
  await st.goto(BASE + '#/fundos/' + encodeURIComponent(designId));
  await st.getByRole('button', { name: 'Sol', exact: true }).click();
  await st.keyboard.press('Shift+ArrowRight');
  await waitSaved(st);
  p = await idbGet(st, 'projects', projectId);
  assert(p.theme.background.design.layers.find((l) => l.name === 'Sol').x === 50, 'o louvor não mudou junto (é cópia)');

  // no editor: aviso de versão nova e "Atualizar"
  await st.goto(BASE + '#/edit/' + projectId);
  await st.getByRole('tab', { name: 'Fundo', exact: true }).click();
  await st.getByText('Há uma versão mais nova em Meus fundos.').waitFor();
  await st.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await st.waitForTimeout(1500);
  p = await idbGet(st, 'projects', projectId);
  assert(p.theme.background.design.layers.find((l) => l.name === 'Sol').x === 55, `"Atualizar" trouxe a versão nova (x=${p.theme.background.design.layers.find((l) => l.name === 'Sol').x})`);
});

await step('Editar no estúdio a partir do louvor e voltar com "Aplicar neste louvor"', async () => {
  await st.getByRole('button', { name: 'Editar no estúdio' }).click();
  await st.waitForURL(/#\/fundos\/.+\/de\//);
  await st.getByRole('button', { name: /Voltar para/ }).waitFor();
  await st.getByRole('button', { name: 'Sol', exact: true }).click();
  await st.keyboard.press('Shift+ArrowDown');
  await st.getByRole('button', { name: 'Aplicar neste louvor' }).click();
  await st.waitForURL(new RegExp(`#/edit/${projectId}`));
  await st.locator('.surface .bg canvas').first().waitFor();
  const p = await idbGet(st, 'projects', projectId);
  assert(p.theme.background.design.layers.find((l) => l.name === 'Sol').y === 55, 'o louvor recebeu a edição');
  await st.close();
});

await step('nenhum erro de console durante todo o fluxo', async () => {
  assert(consoleErrors.length === 0, `${consoleErrors.length} erro(s):\n      ${consoleErrors.slice(0, 5).join('\n      ')}`);
});

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram\n`);
process.exit(failed.length ? 1 : 0);
