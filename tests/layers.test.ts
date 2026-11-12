import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canMoveLayer, lineOfWord, readLine, removeLine, removeWord, removeWordFromText, reorderLayers, shiftWordsAfterRemoval, wordAt } from '../src/core/layers';
import type { TextLayer, WordOverride } from '../src/core/types';
import { defaultTextStyle } from '../src/core/defaults';

const layer = (text: string, words?: Record<string, WordOverride>): TextLayer => ({ id: 'l1', role: 'lyrics', name: 'Letra', text, visible: true, style: defaultTextStyle(), ...(words ? { words } : {}) });
const ov = (scale: number): WordOverride => ({ style: { scale } });

test('removeWordFromText: tira a palavra e um espaço vizinho', () => {
  assert.equal(removeWordFromText('vem sobre mim', 1), 'vem mim');
  assert.equal(removeWordFromText('vem sobre mim', 0), 'sobre mim');
  assert.equal(removeWordFromText('vem sobre mim', 2), 'vem sobre');
});

test('removeWordFromText: palavra sozinha na linha leva a linha junto (sem linha em branco)', () => {
  assert.equal(removeWordFromText('vem sobre mim\nSENHOR', 3), 'vem sobre mim');
  assert.equal(removeWordFromText('vem sobre mim\nSENHOR\nquero te adorar', 3), 'vem sobre mim\nquero te adorar');
});

test('removeWordFromText: preserva linhas em branco que já existiam entre estrofes', () => {
  assert.equal(removeWordFromText('a b\n\nc d', 2), 'a b\n\nd');
});

test('índices dos ajustes andam junto com o texto', () => {
  const w = { '0': ov(0.5), '1': ov(0.6), '3': ov(1.5) };
  const out = shiftWordsAfterRemoval(w, 1)!;
  assert.deepEqual(Object.keys(out).sort(), ['0', '2']);
  assert.equal(out['0'].style?.scale, 0.5);
  assert.equal(out['2'].style?.scale, 1.5); // era a palavra 3
  assert.equal(shiftWordsAfterRemoval({ '1': ov(2) }, 1), undefined); // sobrou nada
});

test('removeWord: texto e ajustes ficam coerentes', () => {
  const l = layer('vem sobre mim\nSENHOR', { '0': ov(0.5), '1': ov(0.5), '2': ov(0.5), '3': ov(2) });
  removeWord(l, 3);
  assert.equal(l.text, 'vem sobre mim');
  assert.deepEqual(Object.keys(l.words!).sort(), ['0', '1', '2']);
  removeWord(l, 0);
  assert.equal(l.text, 'sobre mim');
  assert.deepEqual(Object.keys(l.words!).sort(), ['0', '1']);
  removeWord(l, 0);
  removeWord(l, 0);
  assert.equal(l.text, '');
  assert.equal(l.words, undefined);
});

test('wordAt / lineOfWord', () => {
  assert.equal(wordAt('vem sobre mim\nSENHOR', 3), 'SENHOR');
  assert.equal(wordAt('vem', 5), '');
  assert.equal(lineOfWord('vem sobre mim\nSENHOR', 3), 1);
  assert.equal(lineOfWord('vem sobre mim\n\nSENHOR', 3), 2);
  assert.equal(lineOfWord('a', 9), -1);
});

test('readLine / removeLine: separar uma linha inteira', () => {
  const l = layer('vem sobre mim\nSENHOR\nquero', { '0': ov(0.4), '3': ov(2) });
  const cut = readLine(l, 0)!;
  assert.equal(cut.text, 'vem sobre mim');
  assert.equal(cut.count, 3);
  assert.deepEqual(Object.keys(cut.words!), ['0']);
  removeLine(l, 0);
  assert.equal(l.text, 'SENHOR\nquero');
  assert.deepEqual(Object.keys(l.words!), ['0']); // o ajuste do SENHOR virou a palavra 0
  assert.equal(l.words!['0'].style?.scale, 2);
  assert.equal(readLine(layer('a\n\nb'), 1), null); // linha vazia não é cortada
});

test('reorderLayers: subir/descer/frente/trás; no limite não faz nada', () => {
  const ls = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(reorderLayers(ls, 'a', 'up').map((l) => l.id), ['b', 'a', 'c']);
  assert.deepEqual(reorderLayers(ls, 'c', 'down').map((l) => l.id), ['a', 'c', 'b']);
  assert.deepEqual(reorderLayers(ls, 'a', 'front').map((l) => l.id), ['b', 'c', 'a']);
  assert.deepEqual(reorderLayers(ls, 'c', 'back').map((l) => l.id), ['c', 'a', 'b']);
  assert.equal(reorderLayers(ls, 'c', 'up'), ls);
  assert.equal(reorderLayers(ls, 'a', 'down'), ls);
  assert.equal(reorderLayers(ls, 'zzz', 'up'), ls);
  assert.equal(canMoveLayer(ls, 'c', 'front'), false);
  assert.equal(canMoveLayer(ls, 'b', 'front'), true);
  assert.deepEqual(ls.map((l) => l.id), ['a', 'b', 'c']); // não altera o original
});

import { copyLayer, detachedLayer, duplicateLine, duplicateWord, indexAfterRemoval, layerIsEmpty, readWord, shiftWordsAfterInsert } from '../src/core/layers';

test('duplicateWord: repete a palavra e leva os ajustes junto; as seguintes andam uma posição', () => {
  const l = layer('vem sobre mim\nSENHOR', { '0': ov(0.5), '3': { style: { scale: 2, weight: 900 } } });
  duplicateWord(l, 3);
  assert.equal(l.text, 'vem sobre mim\nSENHOR SENHOR');
  assert.deepEqual(Object.keys(l.words!).sort(), ['0', '3', '4']);
  assert.equal(l.words!['4'].style?.weight, 900);
  assert.notEqual(l.words!['4'], l.words!['3']); // cópia independente
  duplicateWord(l, 0);
  assert.equal(l.text, 'vem vem sobre mim\nSENHOR SENHOR');
  assert.deepEqual(Object.keys(l.words!).sort(), ['0', '1', '4', '5']);
});

test('duplicateLine: copia a linha logo abaixo, com ajustes, e reindexa o resto', () => {
  const l = layer('a b\nc d\ne', { '0': ov(0.5), '2': ov(2), '4': ov(3) });
  duplicateLine(l, 1);
  assert.equal(l.text, 'a b\nc d\nc d\ne');
  assert.deepEqual(Object.keys(l.words!).sort(), ['0', '2', '4', '6']);
  assert.equal(l.words!['2'].style?.scale, 2);
  assert.equal(l.words!['4'].style?.scale, 2); // cópia da palavra 2
  assert.equal(l.words!['6'].style?.scale, 3); // o "e" andou de 4 para 6
});

test('shiftWordsAfterInsert não mexe nos anteriores', () => {
  const out = shiftWordsAfterInsert({ '0': ov(1.1), '2': ov(1.2) }, 1)!;
  assert.deepEqual(Object.keys(out).sort(), ['0', '3']);
});

test('readWord devolve texto e ajuste da palavra', () => {
  const l = layer('vem SENHOR', { '1': ov(2) });
  const cut = readWord(l, 1)!;
  assert.equal(cut.text, 'SENHOR');
  assert.equal(cut.words!['0'].style?.scale, 2);
  assert.equal(readWord(l, 9), null);
});

test('detachedLayer: tamanho vira o da camada e o relativo fica em 1 (palavra sozinha)', () => {
  const src = layer('vem SENHOR', { '1': { style: { scale: 2, weight: 900, textCase: 'upper' }, anim: { enter: { fade: true, slide: false, zoom: 'out', blur: true }, delay: 140 } } });
  const d = detachedLayer(src, readWord(src, 1)!, { x: 40, y: 80, fontSize: 21 }, 'novo');
  assert.equal(d.id, 'novo');
  assert.equal(d.role, 'free');
  assert.equal(d.text, 'SENHOR');
  assert.equal(d.style.fontSize, 21);
  assert.deepEqual([d.style.x, d.style.y, d.style.autoWidth, d.style.equalize], [40, 80, true, false]);
  assert.equal(d.words!['0'].style?.scale, undefined); // o 2× já está no fontSize
  assert.equal(d.words!['0'].style?.weight, 900);
  assert.equal(d.words!['0'].anim?.delay, 140);
  assert.equal(src.style.autoWidth, false); // não mexe na camada de origem
});

test('detachedLayer: linha com tamanhos diferentes mantém a proporção entre as palavras', () => {
  const src = layer('a BB c', { '0': ov(0.5), '1': ov(2), '2': ov(0.5) });
  const d = detachedLayer(src, { text: 'a BB c', words: { '0': ov(0.5), '1': ov(2), '2': ov(0.5) }, count: 3 }, { x: 50, y: 50, fontSize: 20 }, 'n');
  assert.equal(d.words!['1'], undefined); // a maior vira 1 e não precisa de ajuste
  assert.equal(d.words!['0'].style?.scale, 0.25);
  assert.equal(d.words!['2'].style?.scale, 0.25);
});

test('indexAfterRemoval', () => {
  assert.equal(indexAfterRemoval(0, 2), 0);
  assert.equal(indexAfterRemoval(2, 2), -1);
  assert.equal(indexAfterRemoval(5, 2), 4);
  assert.equal(indexAfterRemoval(5, 2, 3), 2);
  assert.equal(indexAfterRemoval(3, 2, 3), -1);
});

test('copyLayer: id novo, deslocada, e só o original continua sendo "a letra"', () => {
  const src = layer('oi');
  const c = copyLayer(src, 'l2');
  assert.equal(c.id, 'l2');
  assert.equal(c.role, 'free');
  assert.equal(c.name, 'Letra cópia');
  assert.ok(c.style.x > src.style.x && c.style.y > src.style.y);
  assert.equal(layerIsEmpty(layer('  \n ')), true);
});

test('várias palavras marcadas viram uma frase só (na ordem do texto, com as quebras de linha)', async () => {
  const { readWords, removeWords } = await import('../src/core/layers');
  const layer = { id: 'a', role: 'lyrics', name: 'Letra', text: 'vem sobre mim\nSENHOR Jesus', visible: true, style: {} as never, words: { '1': { style: { scale: 2 } }, '3': { style: { color: '#ff0000' } } } } as never as import('../src/core/types').TextLayer;
  const cut = readWords(layer, [3, 1, 2])!;
  assert.equal(cut.text, 'sobre mim\nSENHOR');
  assert.equal(cut.count, 3);
  assert.deepEqual(Object.keys(cut.words ?? {}), ['0', '2']);
  removeWords(layer, [3, 1, 2]);
  assert.equal(layer.text, 'vem\nJesus');
});
