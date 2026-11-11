import assert from 'node:assert/strict';
import { test } from 'node:test';
import { equalizeScales } from '../src/core/layout';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('igualar: a linha mais estreita fica em 1 e as outras encolhem até o mesmo comprimento', () => {
  // "vem sobre mim" (largura 640) em cima de "SENHOR" (largura 440)
  const s = equalizeScales([640, 440], { blockWidth: 1600, minScale: 0.3 });
  near(s[1], 1);
  near(s[0], 440 / 640);
  // comprimento final igual
  near(640 * s[0], 440 * s[1]);
});

test('igualar: três linhas terminam com a mesma largura', () => {
  const nat = [900, 500, 1200];
  const s = equalizeScales(nat, { blockWidth: 2000, minScale: 0.1 });
  const widths = nat.map((w, i) => w * s[i]);
  widths.forEach((w) => near(w, widths[0], 1e-6));
  near(widths[0], 500);
});

test('igualar: o piso impede letra miúda demais (a linha fica mais larga que o alvo, mas legível)', () => {
  const s = equalizeScales([2000, 400], { blockWidth: 3000, minScale: 0.5 });
  near(s[0], 0.5); // o alvo pediria 0.2
  near(s[1], 1);
});

test('igualar: nada passa da largura da caixa, nem com o piso', () => {
  const nat = [4000, 900];
  const s = equalizeScales(nat, { blockWidth: 1000, minScale: 0.9 });
  assert.ok(nat[0] * s[0] <= 1000 + 1e-6, 'primeira linha passou da caixa');
});

test('igualar: se todas as linhas são mais largas que a caixa, o alvo é a caixa', () => {
  const nat = [3000, 2000];
  const s = equalizeScales(nat, { blockWidth: 1000, minScale: 0.1 });
  near(nat[0] * s[0], 1000);
  near(nat[1] * s[1], 1000);
});

test('igualar: linhas vazias ficam em 1 e não atrapalham; entrada vazia/ruim não quebra', () => {
  const s = equalizeScales([0, 500, NaN, 800], { blockWidth: 1600, minScale: 0.3 });
  assert.deepEqual([s[0], s[2]], [1, 1]);
  near(s[1], 1);
  near(s[3], 500 / 800);
  assert.deepEqual(equalizeScales([], { blockWidth: 100, minScale: 0.3 }), []);
  assert.deepEqual(equalizeScales([300, 200], { blockWidth: 0, minScale: 0.3 }), [1, 1]);
});

test('igualar: uma linha só não muda nada', () => {
  assert.deepEqual(equalizeScales([700], { blockWidth: 1600, minScale: 0.3 }), [1]);
});

test('âncora: a linha de fonte MAIOR define o comprimento; a de mais palavras encolhe até ela', () => {
  // "vem sobre mim" (fonte 0.44, natural 640) e "SENHOR" (fonte 1, natural 440): a grande manda
  const s = equalizeScales([640, 440], { blockWidth: 1600, minScale: 0.3, bases: [0.44, 1] });
  near(s[1], 1); // SENHOR não muda
  near(640 * s[0], 440); // a linha pequena termina com o MESMO comprimento
});

test('âncora: a linha pequena mais CURTA também cresce até o comprimento da grande (como na referência)', () => {
  // "vem sobre mim" (fonte 0.44, natural 355) sobre "SENHOR" (fonte 1, natural 430)
  const s = equalizeScales([355, 430], { blockWidth: 1600, minScale: 0.3, bases: [0.44, 1] });
  near(355 * s[0], 430);
  near(s[1], 1);
});

test('âncora: ao crescer, a linha pequena nunca passa de 62% da letra grande (a hierarquia se mantém)', () => {
  // "Eu" (natural 80) quereria crescer 5×; o teto é 0.62/0.44
  const s = equalizeScales([80, 440], { blockWidth: 1600, minScale: 0.3, bases: [0.44, 1] });
  near(s[0], 0.62 / 0.44);
  assert.ok(0.44 * s[0] <= 0.62 + 1e-9);
  near(s[1], 1);
});

test('âncora: a caixa limita o crescimento', () => {
  const s = equalizeScales([800, 1500], { blockWidth: 900, minScale: 0.3, bases: [0.44, 1] });
  assert.ok(800 * s[0] <= 900 + 1e-6);
});

test('âncora: a palavra grande NÃO encolhe por causa de uma linha pequena curta (antes o alvo era a mais estreita)', () => {
  const s = equalizeScales([640, 200, 440], { blockWidth: 1600, minScale: 0.3, bases: [0.44, 0.44, 1] });
  near(s[2], 1);
  near(640 * s[0], 440);
  near(s[1], 0.62 / 0.44); // curta demais para chegar a 440: cresce até o teto
});

test('âncora: fontes iguais continuam usando a linha mais estreita como alvo', () => {
  const s = equalizeScales([900, 500, 1200], { blockWidth: 2000, minScale: 0.1, bases: [1, 1, 1] });
  near(900 * s[0], 500);
  near(1200 * s[2], 500);
  near(s[1], 1);
});

test('âncora: duas linhas grandes → a mais estreita das duas define; a pequena ajusta-se a ela', () => {
  const s = equalizeScales([700, 500, 900], { blockWidth: 2000, minScale: 0.1, bases: [1, 1, 0.44] });
  near(700 * s[0], 500);
  near(s[1], 1);
  near(900 * s[2], 500);
});

test('âncora: o piso e a caixa continuam valendo', () => {
  const s = equalizeScales([2000, 400], { blockWidth: 3000, minScale: 0.5, bases: [0.44, 1] });
  near(s[0], 0.5);
  near(s[1], 1);
});
