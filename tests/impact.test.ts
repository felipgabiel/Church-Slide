import assert from 'node:assert/strict';
import { test } from 'node:test';
import { impactLayout } from '../src/core/impact';

const style = (r: ReturnType<typeof impactLayout>, i: number) => r.words[String(i)]?.style;

test('"Vem sobre mim Senhor": a palavra-chave ganha a própria linha, grande e em maiúsculas', () => {
  const r = impactLayout('Vem sobre mim Senhor');
  assert.equal(r.text, 'Vem sobre mim\nSenhor');
  for (const i of [0, 1, 2]) {
    assert.equal(style(r, i)?.scale, 0.44);
    assert.equal(style(r, i)?.textCase, 'lower');
    assert.equal(style(r, i)?.weight, 700);
    assert.equal(r.words[String(i)].anim, undefined);
  }
  assert.equal(style(r, 3)?.textCase, 'upper');
  assert.equal(style(r, 3)?.weight, 900);
  assert.equal(style(r, 3)?.scale, undefined, 'a grande usa o tamanho da camada');
  assert.ok(r.words['3'].anim, 'a palavra grande tem animação própria');
});

test('nome de Deus vence palavra secundária; palavra no meio divide em 3 linhas', () => {
  const r = impactLayout('Tu és Senhor de tudo');
  assert.equal(r.text, 'Tu és\nSenhor\nde tudo');
  assert.equal(style(r, 2)?.textCase, 'upper');
  const r2 = impactLayout('Grande é o Senhor\ne muito digno de louvor');
  assert.equal(r2.text, 'Grande é o\nSenhor\ne muito digno de louvor');
});

test('linha curta com palavra-chave fica inteira grande', () => {
  const r = impactLayout('Santo, Santo, Santo\nDeus Todo-Poderoso');
  // "Deus" é nome de Deus (prioridade 2) numa linha de 2 palavras → linha inteira grande
  assert.equal(r.text, 'Santo, Santo, Santo\nDeus Todo-Poderoso');
  assert.equal(style(r, 3)?.textCase, 'upper');
  assert.equal(style(r, 4)?.textCase, 'upper');
  assert.equal(style(r, 0)?.textCase, 'lower');
});

test('sem palavra-chave: a linha mais curta (a última no empate) é a grande', () => {
  const r = impactLayout('caminhando pela estrada\nsem medo');
  assert.equal(r.text, 'caminhando pela estrada\nsem medo');
  assert.equal(style(r, 3)?.textCase, 'upper');
  assert.equal(style(r, 0)?.textCase, 'lower');
});

test('acentos e pontuação não atrapalham o reconhecimento; texto vazio não quebra', () => {
  assert.equal(impactLayout('Toda glória a Deus!').text, 'Toda glória a\nDeus!');
  const short = impactLayout('Glória a Deus!'); // até 3 palavras: a linha inteira é grande
  assert.equal(short.text, 'Glória a Deus!');
  assert.ok([0, 1, 2].every((i) => short.words[String(i)].style?.textCase === 'upper'));
  assert.deepEqual(impactLayout('   '), { text: '   ', words: {} });
  assert.equal(impactLayout('Jesus').text, 'Jesus');
});

test('os índices das palavras continuam na mesma ordem do texto', () => {
  const r = impactLayout('Vem sobre mim Senhor');
  assert.equal(Object.keys(r.words).length, 4);
  assert.equal(r.text.split(/\s+/).length, 4);
});

import { balanceWords, WRAP_CHARS } from '../src/core/impact';

test('balanceWords: linha curta não quebra; comprida vira partes parecidas, sem perder palavra', () => {
  assert.deepEqual(balanceWords(['vem', 'sobre', 'mim']), [['vem', 'sobre', 'mim']]);
  const long = 'Grande é o Senhor e muito digno de louvor'.split(' ');
  const parts = balanceWords(long);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.flat(), long);
  const lens = parts.map((p) => p.join(' ').length);
  assert.ok(Math.abs(lens[0] - lens[1]) <= 6, `partes desiguais: ${lens}`);
  for (const l of lens) assert.ok(l <= WRAP_CHARS + 4);
});

test('balanceWords: uma palavra enorme não trava nem some', () => {
  assert.deepEqual(balanceWords(['Pneumoultramicroscopicossilicovulcanoconiótico']), [['Pneumoultramicroscopicossilicovulcanoconiótico']]);
  assert.deepEqual(balanceWords([]), [[]]);
});

test('Impacto quebra a linha comprida em partes e mantém os índices das palavras', () => {
  const r = impactLayout('Grande é o Senhor e muito digno de louvor\nNa cidade do nosso Deus');
  const lines = r.text.split('\n');
  assert.ok(lines.every((l) => l.length <= WRAP_CHARS + 6 || !l.includes(' ')), `linhas: ${JSON.stringify(lines)}`);
  assert.equal(r.text.split(/\s+/).join(' '), 'Grande é o Senhor e muito digno de louvor Na cidade do nosso Deus');
  assert.equal(r.words['13']?.style?.textCase, 'upper'); // "Deus" (14ª palavra) continua sendo a grande
});
