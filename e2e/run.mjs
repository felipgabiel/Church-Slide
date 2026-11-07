// Teste de ponta a ponta (Playwright) do build de produção.
//   npm run build && npm run e2e
// Cobre: criar louvor → editar → persistir → operador → janela do telão (sincronia) →
// tela preta → Motion Blur real → erros de console.
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

await step('nenhum erro de console durante todo o fluxo', async () => {
  assert(consoleErrors.length === 0, `${consoleErrors.length} erro(s):\n      ${consoleErrors.slice(0, 5).join('\n      ')}`);
});

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram\n`);
process.exit(failed.length ? 1 : 0);
