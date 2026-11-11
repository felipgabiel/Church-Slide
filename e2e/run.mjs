// Teste de ponta a ponta (Playwright) do build de produção.
//   npm run build && npm run e2e
// Cobre: criar louvor → editar → persistir → operador → janela do telão (sincronia) →
// tela preta → Motion Blur real → erros de console.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
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
  await pg.getByLabel('Predefinição de animação').selectOption({ label: 'Branco → verde' });
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
    pg.evaluate(() =>
      [...document.querySelectorAll('.surface .layer .ln')]
        .filter((l) => l.textContent.trim())
        .map((l) => {
          const r = document.createRange();
          r.selectNodeContents(l);
          return { t: l.textContent.trim(), w: r.getBoundingClientRect().width, fs: parseFloat(getComputedStyle(l).fontSize) };
        }),
    );
  for (const slide of [0, 1]) {
    await pg.getByRole('list', { name: 'Trechos do louvor' }).locator('li').nth(slide).click();
    await pg.waitForTimeout(1800);
    const ls = await lines();
    const big = ls.reduce((a, b) => (b.fs > a.fs ? b : a));
    assert(ls.length >= 2, `trecho ${slide + 1}: esperava várias linhas`);
    for (const l of ls) {
      // linhas curtas só crescem até ~60% da palavra grande (para ela continuar mandando); as demais igualam o comprimento
      if (l === big || l.fs < big.fs * 0.6) assert(Math.abs(l.w - big.w) / big.w < 0.04, `trecho ${slide + 1}: "${l.t}" tem ${l.w.toFixed(0)}px e a palavra grande ${big.w.toFixed(0)}px`);
      if (l !== big) assert(l.fs < big.fs * 0.7, `trecho ${slide + 1}: "${l.t}" deveria ser bem menor que a palavra grande`);
      assert(l.fs >= 16, `trecho ${slide + 1}: "${l.t}" ficou pequena demais (${l.fs.toFixed(0)}px)`);
    }
  }
  await pg.close();
});

await step('nenhum erro de console durante todo o fluxo', async () => {
  assert(consoleErrors.length === 0, `${consoleErrors.length} erro(s):\n      ${consoleErrors.slice(0, 5).join('\n      ')}`);
});

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram\n`);
process.exit(failed.length ? 1 : 0);
