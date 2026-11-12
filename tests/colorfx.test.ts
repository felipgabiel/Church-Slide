import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorAmount, colorAt, colorEnd, colorTiming, mixColor, parseColor, sanitizeColorFx } from '../src/core/anim/colorfx';
import type { ColorFx } from '../src/core/types';

// formato antigo (delay contado depois da entrada) continua valendo; os testes novos usam `start`
const fx = (p: Partial<ColorFx> = {}): ColorFx => ({ colors: ['#00ff00'], mode: 'all', delay: 500, duration: 1000, stagger: 100, ...p });

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
  const ok = sanitizeColorFx({ to: '#abc', mode: 'letter', delay: -5, duration: 9e9, stagger: 'x', back: true, from: 'rgb(1,2,3)' })!; // formato antigo
  assert.deepEqual(ok.colors, ['#abc']);
  assert.equal(ok.mode, 'letter');
  assert.equal(ok.delay, 0);
  assert.equal(ok.duration, 20000);
  assert.equal(ok.stagger, 0);
  assert.equal(ok.back, true);
  assert.equal(ok.from, 'rgb(1,2,3)');
  assert.equal(sanitizeColorFx({ to: '#abc', mode: 'x' })!.mode, 'all');
});

import { colorAlong, colorFinal, colorStart, DEFAULT_COLOR_FX, MAX_COLORS, partOf, planColors } from '../src/core/anim/colorfx';
import { applyPreset, ANIMATION_PRESETS, PRESET_GROUPS } from '../src/core/anim/presets';

const nfx = (p: Partial<ColorFx> = {}): ColorFx => ({ colors: ['#00ff00'], mode: 'all', start: 2000, duration: 1000, stagger: 100, ...p });

test('colorAt: antes de começar usa a cor inicial escolhida (ou a do texto)', () => {
  assert.equal(colorAt(fx({ from: '#ff0000' }), '#ffffff', 0, 0, 0), '#ff0000');
  assert.equal(colorAt(fx(), '#ffffff', 0, 0, 0), null);
  assert.equal(colorAt(fx({ from: '#ff0000' }), '#ffffff', 0, 0, 99999), 'rgb(0, 255, 0)');
});

test('colorFinal: fica na última cor; no pulso volta à original', () => {
  assert.equal(colorFinal(fx(), '#ffffff'), 'rgb(0, 255, 0)');
  assert.equal(colorFinal(fx({ back: true }), '#ffffff'), null);
  assert.equal(colorFinal(fx({ back: true, from: '#ff0000' }), '#ffffff'), '#ff0000');
  assert.equal(colorFinal(nfx({ colors: ['#00ff00', '#0000ff'] }), '#ffffff'), 'rgb(0, 0, 255)');
});

test('início: contado do começo do trecho, mas nunca antes de a entrada terminar', () => {
  assert.equal(colorStart(nfx({ start: 2000 }), 800), 2000); // entrada terminou antes: vale o configurado
  assert.equal(colorStart(nfx({ start: 300 }), 800), 800); // configurado cai dentro da entrada: espera ela terminar
  assert.equal(colorStart(nfx({ start: 0 }), 0), 0);
  assert.equal(colorStart(fx({ delay: 500 }), 800), 1300); // projeto antigo: depois da entrada
  // o "Começa em" não mexe na entrada: com 2 s e entrada de 0,8 s, em 1,9 s nada mudou e em 2,5 s está no meio
  assert.equal(colorAt(nfx(), '#ffffff', 0, 800, 1900), null);
  const mid = colorAt(nfx(), '#ffffff', 0, 800, 2500)!;
  assert.notEqual(mid, 'rgb(255, 255, 255)');
  assert.notEqual(mid, 'rgb(0, 255, 0)');
});

test('sequência: respeita a ordem das cores (branco → vermelho → azul)', () => {
  const f = nfx({ colors: ['#ff0000', '#0000ff'] });
  assert.equal(colorAlong(f, '#ffffff', 0), 'rgb(255, 255, 255)');
  assert.equal(colorAlong(f, '#ffffff', 0.5), 'rgb(255, 0, 0)'); // metade do caminho = 1ª cor
  assert.equal(colorAlong(f, '#ffffff', 1), 'rgb(0, 0, 255)');
  assert.equal(colorAlong(f, '#ffffff', 0.25), 'rgb(255, 128, 128)');
  // três cores: cada uma ocupa um terço
  const g = nfx({ colors: ['#ff0000', '#00ff00', '#0000ff'], from: '#000000' });
  assert.equal(colorAlong(g, '#ffffff', 1 / 3), 'rgb(255, 0, 0)');
  assert.equal(colorAlong(g, '#ffffff', 2 / 3), 'rgb(0, 255, 0)');
});

test('grupos: só palavras marcadas entram; ordem e letras contadas dentro do grupo', () => {
  const a = nfx({ mode: 'word' });
  const b = nfx({ mode: 'letter', colors: ['#ff0000'] });
  const plan = planColors([
    { index: 0, text: 'vem' },
    { index: 1, text: 'sobre', fx: a },
    { index: 2, text: 'mim' },
    { index: 3, text: 'SENHOR', fx: a },
    { index: 4, text: 'Deus', fx: b },
    { index: 5, text: 'Pai', fx: b },
  ]);
  assert.equal(plan.has(0), false, 'palavra não marcada não troca de cor');
  assert.equal(plan.has(2), false);
  assert.equal(plan.get(1)!.part, 0);
  assert.equal(plan.get(3)!.part, 1); // 2ª palavra DO GRUPO, não a 4ª do texto
  assert.equal(plan.get(3)!.parts, 2);
  assert.equal(partOf(plan.get(5)!, 1), 4 + 1); // "Deus" tem 4 letras, depois a 2ª letra de "Pai"
  assert.equal(plan.get(4)!.parts, 7);
});

test('colorEnd por letra considera a última letra', () => {
  const f = fx({ mode: 'letter', delay: 100, duration: 500, stagger: 50 });
  assert.equal(colorEnd(f, 11, 1000), 1000 + 100 + 10 * 50 + 500);
});

test('sanitizeColorFx: sequência nova, limite de cores e cores inválidas descartadas', () => {
  const ok = sanitizeColorFx({ colors: ['#f00', 'banana', '#00ff00'], mode: 'word', start: 1500, duration: 800, stagger: 200 })!;
  assert.deepEqual(ok.colors, ['#f00', '#00ff00']);
  assert.equal(ok.start, 1500);
  assert.equal(ok.delay, undefined);
  assert.equal(sanitizeColorFx({ colors: Array(20).fill('#fff') })!.colors.length, MAX_COLORS);
  assert.equal(sanitizeColorFx({ colors: [] }), undefined);
  assert.equal(sanitizeColorFx({ colors: ['#fff'], start: 999999 })!.start, 60000);
  assert.equal(DEFAULT_COLOR_FX.start, 2000);
});

test('presets: nenhum estilo pronto troca a cor (isso fica só na ferramenta de cor)', () => {
  for (const x of ANIMATION_PRESETS) {
    assert.ok(PRESET_GROUPS.includes(x.group), x.id);
    assert.equal(x.color, undefined, `${x.id} não deveria trazer troca de cor`);
    assert.equal(applyPreset(x.id).colorFx, undefined, x.id);
  }
});
