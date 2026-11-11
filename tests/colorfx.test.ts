import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorAmount, colorAt, colorEnd, colorTiming, mixColor, parseColor, sanitizeColorFx } from '../src/core/anim/colorfx';
import type { ColorFx } from '../src/core/types';

const fx = (p: Partial<ColorFx> = {}): ColorFx => ({ to: '#00ff00', mode: 'all', delay: 500, duration: 1000, stagger: 100, ...p });

test('cores: hex curto/longo/com alfa e rgb() são lidos', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('#0a8'), [0, 170, 136, 1]);
  assert.deepEqual(parseColor('#112233'), [17, 34, 51, 1]);
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30, 1]);
  const a = parseColor('rgba(10,20,30,0.5)')!;
  assert.equal(a[3], 0.5);
  assert.equal(parseColor('banana'), null);
});

test('mistura: extremos exatos e meio do caminho de branco para verde', () => {
  assert.equal(mixColor('#ffffff', '#00ff00', 0), 'rgb(255, 255, 255)');
  assert.equal(mixColor('#ffffff', '#00ff00', 1), 'rgb(0, 255, 0)');
  assert.equal(mixColor('#ffffff', '#00ff00', 0.5), 'rgb(128, 255, 128)');
  assert.equal(mixColor('#ffffff', '#00ff00', 9), 'rgb(0, 255, 0)'); // fora da faixa é limitado
  assert.equal(mixColor('???', '#00ff00', 0.5), '#00ff00'); // cor inválida não quebra
});

test('tempo: nada acontece antes da entrada terminar + atraso; depois, vai de 0 a 1 e fica', () => {
  const f = fx();
  assert.equal(colorAmount(f, 0, 800, 0), 0);
  assert.equal(colorAmount(f, 0, 800, 800 + 500), 0); // começa exatamente aqui
  const mid = colorAmount(f, 0, 800, 800 + 500 + 500);
  assert.ok(mid > 0.4 && mid < 0.6, `meio = ${mid}`);
  assert.equal(colorAmount(f, 0, 800, 800 + 500 + 1000), 1);
  assert.equal(colorAmount(f, 0, 800, 99999), 1); // fica na cor final
});

test('tempo: é monotônico (a cor nunca "volta") quando não é pulso', () => {
  const f = fx();
  let prev = -1;
  for (let t = 0; t <= 3000; t += 25) {
    const k = colorAmount(f, 0, 0, t);
    assert.ok(k >= prev - 1e-12, `caiu em t=${t}`);
    prev = k;
  }
});

test('modos: "tudo junto" ignora o intervalo; palavra/letra escalonam', () => {
  assert.equal(colorTiming(fx({ mode: 'all' }), 7, 0).start, 500);
  assert.equal(colorTiming(fx({ mode: 'word' }), 3, 0).start, 500 + 300);
  assert.equal(colorTiming(fx({ mode: 'letter', stagger: 40 }), 10, 200).start, 200 + 500 + 400);
});

test('fim: considera a última palavra/letra', () => {
  assert.equal(colorEnd(fx({ mode: 'all' }), 9, 1000), 1000 + 500 + 1000);
  assert.equal(colorEnd(fx({ mode: 'word' }), 5, 1000), 1000 + 500 + 4 * 100 + 1000);
  assert.equal(colorEnd(fx({ mode: 'letter', stagger: 30 }), 20, 0), 500 + 19 * 30 + 1000);
});

test('pulso (back): vai à cor final no meio e volta à original no fim', () => {
  const f = fx({ back: true, mode: 'word' });
  assert.equal(colorAmount(f, 0, 0, 500), 0);
  assert.ok(colorAmount(f, 0, 0, 1000) > 0.99);
  assert.ok(colorAmount(f, 0, 0, 1500) < 1e-9);
});

test('colorAt: null antes de começar (mantém a cor original) e usa "from" quando existe', () => {
  const f = fx();
  assert.equal(colorAt(f, '#ffffff', 0, 0, 100), null);
  assert.equal(colorAt(f, '#ffffff', 0, 0, 5000), 'rgb(0, 255, 0)');
  const g = fx({ from: '#ff0000' });
  assert.equal(colorAt(g, '#ffffff', 0, 0, 5000), 'rgb(0, 255, 0)');
  assert.ok(/^rgb\(2\d\d, \d+, \d+\)$/.test(colorAt(g, '#ffffff', 0, 0, 500 + 30)!), 'deve partir do vermelho, não do branco');
});

test('sanitizeColorFx: aceita válido, limita números, recusa lixo', () => {
  assert.equal(sanitizeColorFx(null), undefined);
  assert.equal(sanitizeColorFx({ to: 'nada' }), undefined);
  const ok = sanitizeColorFx({ to: '#abc', mode: 'letter', delay: -5, duration: 9e9, stagger: 'x', back: true, from: 'rgb(1,2,3)' })!;
  assert.equal(ok.mode, 'letter');
  assert.equal(ok.delay, 0);
  assert.equal(ok.duration, 20000);
  assert.equal(ok.stagger, 0);
  assert.equal(ok.back, true);
  assert.equal(ok.from, 'rgb(1,2,3)');
  assert.equal(sanitizeColorFx({ to: '#abc', mode: 'x' })!.mode, 'all');
});

import { colorFinal, colorPartCount, colorPartIndex } from '../src/core/anim/colorfx';
import { applyPreset, ANIMATION_PRESETS, PRESET_GROUPS } from '../src/core/anim/presets';

test('colorAt: antes de começar usa a cor inicial escolhida (ou a do texto)', () => {
  assert.equal(colorAt(fx({ from: '#ff0000' }), '#ffffff', 0, 0, 0), '#ff0000');
  assert.equal(colorAt(fx(), '#ffffff', 0, 0, 0), null);
  assert.equal(colorAt(fx({ from: '#ff0000' }), '#ffffff', 0, 0, 99999), 'rgb(0, 255, 0)');
});

test('colorFinal: fica na cor final; no pulso volta à original', () => {
  assert.equal(colorFinal(fx(), '#ffffff'), 'rgb(0, 255, 0)');
  assert.equal(colorFinal(fx({ back: true }), '#ffffff'), null);
  assert.equal(colorFinal(fx({ back: true, from: '#ff0000' }), '#ffffff'), '#ff0000');
});

test('partes: contagem e posição por modo (junto / palavra / letra)', () => {
  const words = ['vem', 'sobre', 'mim'];
  assert.equal(colorPartCount('all', words), 1);
  assert.equal(colorPartCount('word', words), 3);
  assert.equal(colorPartCount('letter', words), 11);
  assert.equal(colorPartIndex('all', words, 2), 0);
  assert.equal(colorPartIndex('word', words, 2), 2);
  assert.equal(colorPartIndex('letter', words, 1, 2), 5); // "vem"=3 letras, depois a 3ª de "sobre"
});

test('colorEnd por letra considera a última letra', () => {
  const f = fx({ mode: 'letter', delay: 100, duration: 500, stagger: 50 });
  assert.equal(colorEnd(f, 11, 1000), 1000 + 100 + 10 * 50 + 500);
});

test('presets: os de cor trazem a troca; "Sem animação" e escolher outro efeito se comportam como esperado', () => {
  const green = applyPreset('color-green');
  assert.equal(green.colorFx?.to, '#4ade80');
  assert.equal(green.colorFx?.mode, 'all');
  assert.ok(green.enter.fade, 'entra com animação básica antes de trocar de cor');
  assert.equal(applyPreset('none', green).colorFx, null); // sem animação limpa a troca
  assert.deepEqual(applyPreset('fade', green).colorFx, green.colorFx); // outros efeitos mantêm a troca
  for (const p of ANIMATION_PRESETS) assert.ok(PRESET_GROUPS.includes(p.group), p.id);
  for (const p of ANIMATION_PRESETS.filter((x) => x.group === 'Troca de cor')) assert.ok(sanitizeColorFx(p.config.colorFx), `${p.id} válido`);
});
