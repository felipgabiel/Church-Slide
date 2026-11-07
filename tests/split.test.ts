import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel, slidesToLyrics, splitLyrics } from '../src/core/split';
import { defaultTheme, newSlide } from '../src/core/defaults';

const LYRICS = `[Verso 1]
Santo, santo, santo
Senhor Deus todo-poderoso
Cedo de manhã
Cantaremos teu louvor

Refrão:
Tu és digno
Tu és digno

Ponte
Aleluia
Aleluia`;

test('parseLabel reconhece marcadores comuns', () => {
  assert.equal(parseLabel('[Verso 1]'), 'Verso 1');
  assert.equal(parseLabel('Refrão:'), 'Refrão');
  assert.equal(parseLabel('(Coro)'), 'Coro');
  assert.equal(parseLabel('Ponte'), 'Ponte');
  assert.equal(parseLabel('Santo, santo, santo'), null);
  assert.equal(parseLabel('Final feliz da história'), null);
});

test('modo estrofe separa por linha em branco e preserva rótulos', () => {
  const parts = splitLyrics(LYRICS, { mode: 'stanza' });
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((p) => p.label), ['Verso 1', 'Refrão', 'Ponte']);
  assert.equal(parts[1].text, 'Tu és digno\nTu és digno');
});

test('estrofes longas são divididas de forma equilibrada', () => {
  const text = 'a\nb\nc\nd\ne\nf';
  const parts = splitLyrics(text, { mode: 'stanza', maxLines: 4 });
  assert.deepEqual(parts.map((p) => p.text), ['a\nb\nc', 'd\ne\nf']);
});

test('modo linha gera um trecho por linha', () => {
  const parts = splitLyrics('um\ndois\n\ntrês', { mode: 'line' });
  assert.deepEqual(parts.map((p) => p.text), ['um', 'dois', 'três']);
});

test('modo pares agrupa de 2 em 2 dentro da estrofe', () => {
  const parts = splitLyrics('1\n2\n3\n\n4\n5', { mode: 'pairs' });
  assert.deepEqual(parts.map((p) => p.text), ['1\n2', '3', '4\n5']);
});

test('modo manual só divide em ---', () => {
  const parts = splitLyrics('a\n\nb\n---\nc', { mode: 'manual' });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, 'a\n\nb');
  assert.equal(parts[1].text, 'c');
});

test('trata CRLF e espaços finais', () => {
  const parts = splitLyrics('a  \r\nb\r\n\r\nc', { mode: 'stanza' });
  assert.deepEqual(parts.map((p) => p.text), ['a\nb', 'c']);
});

test('texto vazio não gera trechos', () => {
  assert.equal(splitLyrics('  \n\n ', { mode: 'stanza' }).length, 0);
});

test('slidesToLyrics reconstrói a letra com rótulos', () => {
  const theme = defaultTheme();
  const a = newSlide('Linha 1\nLinha 2', theme, 'Verso 1');
  const b = newSlide('Coro aqui', theme, '');
  const text = slidesToLyrics([a, b], 'stanza');
  assert.equal(text, '[Verso 1]\nLinha 1\nLinha 2\n\nCoro aqui');
  const back = splitLyrics(text, { mode: 'stanza' });
  assert.equal(back.length, 2);
  assert.equal(back[0].label, 'Verso 1');
});
